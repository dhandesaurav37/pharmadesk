import crypto from 'node:crypto';
import { z } from 'zod';
import { firestore } from '../lib/firebaseAdmin';
import { BadRequestError } from '../lib/errors';
import { logger } from '../lib/logger';

export const LEAD_INQUIRY_TYPES = [
  'FREE_TRIAL',
  'BOOK_DEMO',
  'CALLBACK',
  'SALES_ENQUIRY',
  'SUPPORT',
] as const;

export type LeadInquiryType = (typeof LEAD_INQUIRY_TYPES)[number];

export function normalizeIndianMobile(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+91${digits.slice(2)}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `+91${digits.slice(1)}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return '';
}

export const createPublicLeadSchema = z
  .object({
    inquiryType: z.enum(LEAD_INQUIRY_TYPES).default('SALES_ENQUIRY'),
    pharmacyName: z
      .string()
      .trim()
      .min(2, 'Pharmacy name must be at least 2 characters')
      .max(120, 'Pharmacy name must not exceed 120 characters'),
    ownerName: z
      .string()
      .trim()
      .min(2, 'Owner or contact name must be at least 2 characters')
      .max(100, 'Owner name must not exceed 100 characters'),
    mobile: z
      .string()
      .trim()
      .refine((val) => {
        const normalized = normalizeIndianMobile(val);
        return /^\+91[6-9]\d{9}$/.test(normalized);
      }, 'Please enter a valid 10-digit Indian mobile number'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email('Please enter a valid email address')
      .max(160, 'Email address is too long'),
    city: z
      .string()
      .trim()
      .min(2, 'City must be at least 2 characters')
      .max(80, 'City name must not exceed 80 characters'),
    branchCount: z.coerce
      .number()
      .int('Number of branches must be a whole number')
      .min(1, 'Number of branches must be at least 1')
      .max(500, 'For more than 500 branches, specify 500 and add details in the message'),
    message: z
      .string()
      .trim()
      .max(1500, 'Message cannot exceed 1500 characters')
      .optional()
      .default(''),
    sourcePath: z
      .string()
      .trim()
      .max(120)
      .optional()
      .default('/'),
    // Honeypot trap field: must remain empty for legitimate users
    website: z.string().optional().default(''),
  })
  .strict();

export type CreatePublicLeadPayload = z.infer<typeof createPublicLeadSchema>;

export interface MarketingLeadRecord {
  id: string;
  referenceCode: string;
  inquiryType: LeadInquiryType;
  pharmacyName: string;
  ownerName: string;
  normalizedMobile: string;
  email: string;
  city: string;
  branchCount: number;
  message: string;
  sourcePath: string;
  status: 'RECEIVED';
  ipHash: string;
  userAgentSummary: string;
  createdAt: string;
}

const isTestMode = (): boolean =>
  process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

const testLeadsStore = new Map<string, MarketingLeadRecord>();
const recentLeadFingerprints = new Map<string, number>();

export function resetTestLeadsStore(): void {
  if (!isTestMode()) return;
  testLeadsStore.clear();
  recentLeadFingerprints.clear();
}

export function getTestLeadsSnapshot(): MarketingLeadRecord[] {
  if (!isTestMode()) return [];
  return Array.from(testLeadsStore.values());
}

function hashValue(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 24);
}

export class LeadService {
  static async submitPublicLead(
    payload: CreatePublicLeadPayload,
    meta: { ipAddress: string; userAgent?: string }
  ): Promise<{
    leadId: string;
    referenceCode: string;
    inquiryType: LeadInquiryType;
    status: 'RECEIVED';
    submittedAt: string;
  }> {
    if (payload.website && payload.website.trim().length > 0) {
      throw new BadRequestError('Invalid enquiry submission.');
    }

    const normalizedMobile = normalizeIndianMobile(payload.mobile);
    const fingerprint = hashValue(
      `${normalizedMobile}|${payload.email}|${payload.inquiryType}`
    );

    const nowMs = Date.now();
    const prevAttemptMs = recentLeadFingerprints.get(fingerprint);
    if (prevAttemptMs && nowMs - prevAttemptMs < 5 * 60 * 1000) {
      throw new BadRequestError(
        'An enquiry with these details was recently received. Our team will contact you shortly.'
      );
    }

    const leadId = `lead_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const referenceCode = `PD-ENQ-${crypto
      .createHash('sha256')
      .update(leadId)
      .digest('hex')
      .slice(0, 6)
      .toUpperCase()}`;
    const createdAt = new Date(nowMs).toISOString();

    const record: MarketingLeadRecord = {
      id: leadId,
      referenceCode,
      inquiryType: payload.inquiryType,
      pharmacyName: payload.pharmacyName,
      ownerName: payload.ownerName,
      normalizedMobile,
      email: payload.email,
      city: payload.city,
      branchCount: payload.branchCount,
      message: payload.message || '',
      sourcePath: payload.sourcePath || '/',
      status: 'RECEIVED',
      ipHash: hashValue(meta.ipAddress || 'unknown'),
      userAgentSummary: (meta.userAgent || '').slice(0, 160),
      createdAt,
    };

    if (isTestMode()) {
      testLeadsStore.set(leadId, record);
    } else {
      const db = firestore();
      await db.collection('marketing_leads').doc(leadId).set(record);
    }

    recentLeadFingerprints.set(fingerprint, nowMs);

    logger.info(
      {
        leadId,
        referenceCode,
        inquiryType: record.inquiryType,
        city: record.city,
        branchCount: record.branchCount,
      },
      'Public marketing enquiry stored securely'
    );

    return {
      leadId,
      referenceCode,
      inquiryType: record.inquiryType,
      status: 'RECEIVED',
      submittedAt: createdAt,
    };
  }
}
