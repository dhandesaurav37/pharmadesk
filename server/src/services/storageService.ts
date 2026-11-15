import crypto from 'node:crypto';
import { storage } from '../lib/firebaseAdmin';
import { BadRequestError } from '../lib/errors';
import { env } from '../config/env';
import { logger } from '../lib/logger';

export type StorageCategory =
  | 'invoice_pdfs'
  | 'prescriptions'
  | 'supplier_bills'
  | 'product_images'
  | 'documents';

export interface SignedUploadUrlOptions {
  tenantId: string;
  branchId: string;
  category: StorageCategory;
  fileName: string;
  contentType: string;
  expiresInMinutes?: number;
}

export interface SignedDownloadUrlOptions {
  tenantId: string;
  branchId: string;
  category: StorageCategory;
  fileId: string;
  expiresInMinutes?: number;
}

export interface VerifyUploadedObjectOptions {
  tenantId: string;
  branchId: string;
  category: StorageCategory;
  fileId: string;
  expectedContentType: string;
  headerBytesBase64?: string;
}

const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

const ALL_ALLOWED_EXTENSIONS = new Set(
  Object.values(ALLOWED_CONTENT_TYPES).flat()
);

const MAX_STORAGE_FILE_BYTES = 15 * 1024 * 1024;
const SAFE_SEGMENT_REGEX = /^[a-zA-Z0-9_-]{2,64}$/;
const SAFE_FILE_ID_REGEX = /^[a-zA-Z0-9._-]{3,180}$/;

function assertSafeTenantAndBranch(tenantId: string, branchId: string): void {
  if (!SAFE_SEGMENT_REGEX.test(tenantId) || !SAFE_SEGMENT_REGEX.test(branchId)) {
    throw new BadRequestError('Invalid tenant or branch identifier for storage path.');
  }
}

function assertSafeFileId(fileId: string): string {
  const trimmed = (fileId || '').trim();
  if (
    !trimmed ||
    trimmed.includes('..') ||
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('%') ||
    trimmed.includes('\0') ||
    !SAFE_FILE_ID_REGEX.test(trimmed)
  ) {
    throw new BadRequestError('Invalid fileId format. Path traversal sequences and special characters are prohibited.');
  }
  const ext = trimmed.split('.').pop()?.toLowerCase() || '';
  if (!ALL_ALLOWED_EXTENSIONS.has(ext)) {
    throw new BadRequestError(`Unsupported file extension '.${ext}'.`);
  }
  return trimmed;
}

function clampExpiryMinutes(minutes?: number): number {
  const num = Number(minutes);
  if (!Number.isFinite(num) || num <= 0) return 15;
  return Math.max(1, Math.min(60, Math.floor(num)));
}

/**
 * Inspects file header magic bytes and checks for embedded active HTML/SVG/script polyglots.
 */
export function inspectFileContentSignature(
  buffer: Buffer,
  declaredContentType: string
): { valid: boolean; detectedType: string; reason?: string } {
  const normalized = declaredContentType.trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES[normalized]) {
    return { valid: false, detectedType: 'unknown', reason: `Unsupported media type '${declaredContentType}'.` };
  }
  if (!buffer || buffer.length < 4) {
    return { valid: false, detectedType: 'unknown', reason: 'Uploaded file header is empty or truncated.' };
  }

  const headText = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8').toLowerCase();
  if (
    headText.includes('<svg') ||
    headText.includes('<script') ||
    headText.includes('<!doctype html') ||
    headText.includes('<html') ||
    headText.includes('<?php')
  ) {
    return {
      valid: false,
      detectedType: 'active_markup',
      reason: 'Active script or HTML/SVG markup detected inside uploaded file.',
    };
  }

  // Magic-byte signatures
  const isPdf =
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d; // %PDF-

  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  const isPng =
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;

  const isWebp =
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  let detectedType = 'unknown';
  if (isPdf) detectedType = 'application/pdf';
  else if (isJpeg) detectedType = 'image/jpeg';
  else if (isPng) detectedType = 'image/png';
  else if (isWebp) detectedType = 'image/webp';

  if (detectedType !== normalized) {
    return {
      valid: false,
      detectedType,
      reason: `File magic-byte signature '${detectedType}' does not match declared Content-Type '${normalized}'.`,
    };
  }

  return { valid: true, detectedType };
}

export class StorageService {
  /**
   * Generates a time-limited signed V4 PUT URL allowing authorized client upload to Firebase Storage.
   * Enforces tenant and branch directory boundary and MIME/extension consistency.
   */
  public static async getSignedUploadUrl(options: SignedUploadUrlOptions) {
    const { tenantId, branchId, category, fileName, contentType, expiresInMinutes = 15 } = options;
    assertSafeTenantAndBranch(tenantId, branchId);

    const normalizedType = contentType.trim().toLowerCase();
    const allowedExtensions = ALLOWED_CONTENT_TYPES[normalizedType];

    if (!allowedExtensions) {
      throw new BadRequestError(
        `Unsupported media type: '${contentType}'. Allowed types: JPG, PNG, WEBP, PDF.`
      );
    }

    if (
      !fileName ||
      fileName.includes('..') ||
      fileName.includes('/') ||
      fileName.includes('\\') ||
      fileName.includes('%') ||
      fileName.includes('\0')
    ) {
      throw new BadRequestError('Invalid fileName. Provide a clean filename without path separators or traversal characters.');
    }

    const baseName = fileName.trim();
    if (!baseName || !baseName.includes('.') || !SAFE_FILE_ID_REGEX.test(baseName)) {
      throw new BadRequestError('Invalid fileName. Provide a clean alphanumeric filename with a supported extension.');
    }

    // Clean file extension and verify it matches declared Content-Type
    const extension = baseName.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestError(
        `File extension '.${extension}' does not match declared Content-Type '${normalizedType}'.`
      );
    }

    const ttlMinutes = clampExpiryMinutes(expiresInMinutes);
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString('hex');
    const fileId = `${timestamp}_${randomHex}.${extension}`;

    // Tenant-isolated and branch-scoped Cloud Storage path
    const storagePath = `tenants/${tenantId}/branches/${branchId}/${category}/${fileId}`;

    const bucketName = env.FIREBASE_STORAGE_BUCKET;
    const bucket = storage().bucket(bucketName);
    const file = bucket.file(storagePath);

    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;

    let signedUrl = '';
    const isTestOrEmulator =
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST) ||
      Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);

    try {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'write',
        expires: expiresAt,
        contentType: normalizedType,
      });
      signedUrl = url;
    } catch (err: any) {
      if (!isTestOrEmulator) {
        logger.error({ err: err?.message, path: storagePath }, 'Failed to generate signed upload URL');
        throw new Error('Unable to generate signed upload URL from Firebase Storage');
      }
      logger.warn({ err: err?.message, path: storagePath }, 'Using mock signed upload URL for test/emulator environment');
      signedUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}?mockSignature=${randomHex}`;
    }

    logger.info({ tenantId, branchId, storagePath }, 'Generated signed upload URL');

    return {
      uploadUrl: signedUrl,
      storagePath,
      fileId,
      expiresAt: new Date(expiresAt).toISOString(),
      contentType: normalizedType,
    };
  }

  /**
   * Generates a time-limited signed V4 GET URL for secure file retrieval.
   */
  public static async getSignedDownloadUrl(options: SignedDownloadUrlOptions) {
    const { tenantId, branchId, category, fileId, expiresInMinutes = 15 } = options;
    assertSafeTenantAndBranch(tenantId, branchId);
    const safeFileId = assertSafeFileId(fileId);

    const ttlMinutes = clampExpiryMinutes(expiresInMinutes);
    const storagePath = `tenants/${tenantId}/branches/${branchId}/${category}/${safeFileId}`;

    const bucketName = env.FIREBASE_STORAGE_BUCKET;
    const bucket = storage().bucket(bucketName);
    const file = bucket.file(storagePath);

    const expiresAt = Date.now() + ttlMinutes * 60 * 1000;

    let downloadUrl = '';
    const isTestOrEmulator =
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST) ||
      Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);

    try {
      const [url] = await file.getSignedUrl({
        version: 'v4',
        action: 'read',
        expires: expiresAt,
      });
      downloadUrl = url;
    } catch (err: any) {
      if (!isTestOrEmulator) {
        logger.error({ err: err?.message, path: storagePath }, 'Failed to generate signed download URL');
        throw new Error('Unable to generate signed download URL from Firebase Storage');
      }
      logger.warn({ err: err?.message, path: storagePath }, 'Using mock signed download URL for test/emulator environment');
      downloadUrl = `https://storage.googleapis.com/${bucketName}/${storagePath}?mockDownload=${Date.now()}`;
    }

    return {
      downloadUrl,
      storagePath,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }

  /**
   * Verifies uploaded object metadata and magic-byte signature before marking an uploaded document trusted.
   */
  public static async verifyUploadedObject(options: VerifyUploadedObjectOptions) {
    const { tenantId, branchId, category, fileId, expectedContentType, headerBytesBase64 } = options;
    assertSafeTenantAndBranch(tenantId, branchId);
    const safeFileId = assertSafeFileId(fileId);

    const normalizedExpected = expectedContentType.trim().toLowerCase();
    const allowedExts = ALLOWED_CONTENT_TYPES[normalizedExpected];
    if (!allowedExts) {
      throw new BadRequestError(`Unsupported media type '${expectedContentType}'.`);
    }

    const ext = safeFileId.split('.').pop()?.toLowerCase() || '';
    if (!allowedExts.includes(ext)) {
      throw new BadRequestError(
        `File extension '.${ext}' does not match expected Content-Type '${normalizedExpected}'.`
      );
    }

    const storagePath = `tenants/${tenantId}/branches/${branchId}/${category}/${safeFileId}`;
    const isTestOrEmulator =
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test' ||
      Boolean(process.env.VITEST) ||
      Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST);

    if (headerBytesBase64) {
      const sample = Buffer.from(headerBytesBase64, 'base64');
      const inspection = inspectFileContentSignature(sample, normalizedExpected);
      if (!inspection.valid) {
        throw new BadRequestError(inspection.reason || 'Uploaded file content signature validation failed.');
      }
      return {
        verified: true,
        storagePath,
        fileId: safeFileId,
        detectedType: inspection.detectedType,
        sizeBytes: sample.length,
        source: isTestOrEmulator ? 'header_sample_test' : 'header_sample',
      };
    }

    const bucket = storage().bucket(env.FIREBASE_STORAGE_BUCKET);
    const file = bucket.file(storagePath);

    try {
      const [metadata] = await file.getMetadata();
      const sizeBytes = Number(metadata.size || 0);
      if (sizeBytes <= 0 || sizeBytes > MAX_STORAGE_FILE_BYTES) {
        throw new BadRequestError(
          `Uploaded object size (${sizeBytes} bytes) is outside allowed range (1 byte to 15 MB).`
        );
      }

      const [headerChunk] = await file.download({ start: 0, end: 8191 });
      const inspection = inspectFileContentSignature(headerChunk, normalizedExpected);
      if (!inspection.valid) {
        await file.delete().catch(() => undefined);
        throw new BadRequestError(
          inspection.reason || 'Uploaded file failed magic-byte signature validation and was quarantined.'
        );
      }

      return {
        verified: true,
        storagePath,
        fileId: safeFileId,
        detectedType: inspection.detectedType,
        sizeBytes,
        source: 'gcs_object',
      };
    } catch (err: any) {
      if (err instanceof BadRequestError) {
        throw err;
      }
      if (isTestOrEmulator) {
        throw new BadRequestError('Provide headerBytesBase64 when verifying uploads in offline test mode.');
      }
      logger.error({ err: err?.message, storagePath }, 'Failed to inspect uploaded object in Firebase Storage');
      throw new BadRequestError('Unable to verify uploaded object in Firebase Storage.');
    }
  }
}
