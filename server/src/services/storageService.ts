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

const ALLOWED_CONTENT_TYPES: Record<string, string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
};

export class StorageService {
  /**
   * Generates a time-limited signed V4 PUT URL allowing authorized client upload to Firebase Storage.
   * Enforces tenant and branch directory boundary and MIME/extension consistency.
   */
  public static async getSignedUploadUrl(options: SignedUploadUrlOptions) {
    const { tenantId, branchId, category, fileName, contentType, expiresInMinutes = 15 } = options;
    const normalizedType = contentType.trim().toLowerCase();
    const allowedExtensions = ALLOWED_CONTENT_TYPES[normalizedType];

    if (!allowedExtensions) {
      throw new BadRequestError(
        `Unsupported media type: '${contentType}'. Allowed types: JPG, PNG, WEBP, PDF.`
      );
    }

    const baseName = fileName.split(/[/\\]/).pop() || '';
    if (!baseName || baseName.includes('..') || !baseName.includes('.')) {
      throw new BadRequestError('Invalid fileName. Provide a clean filename with a supported extension.');
    }

    // Clean file extension and verify it matches declared Content-Type
    const extension = baseName.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(extension)) {
      throw new BadRequestError(
        `File extension '.${extension}' does not match declared Content-Type '${normalizedType}'.`
      );
    }

    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 10);
    const fileId = `${timestamp}_${randomHex}.${extension}`;

    // Tenant-isolated and branch-scoped Cloud Storage path
    const storagePath = `tenants/${tenantId}/branches/${branchId}/${category}/${fileId}`;

    const bucketName = env.FIREBASE_STORAGE_BUCKET;
    const bucket = storage().bucket(bucketName);
    const file = bucket.file(storagePath);

    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

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
        contentType,
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
      contentType,
    };
  }

  /**
   * Generates a time-limited signed V4 GET URL for secure file retrieval.
   */
  public static async getSignedDownloadUrl(options: SignedDownloadUrlOptions) {
    const { tenantId, branchId, category, fileId, expiresInMinutes = 15 } = options;

    // Sanitize fileId to prevent path traversal
    const safeFileId = fileId.replace(/\.\./g, '').replace(/\//g, '');
    const storagePath = `tenants/${tenantId}/branches/${branchId}/${category}/${safeFileId}`;

    const bucketName = env.FIREBASE_STORAGE_BUCKET;
    const bucket = storage().bucket(bucketName);
    const file = bucket.file(storagePath);

    const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

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
}
