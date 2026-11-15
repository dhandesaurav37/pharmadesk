/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveApiUrl } from './apiConfig.ts';

export type PublicInquiryType =
  | 'FREE_TRIAL'
  | 'BOOK_DEMO'
  | 'CALLBACK'
  | 'SALES_ENQUIRY'
  | 'SUPPORT';

export interface PublicLeadPayload {
  inquiryType: PublicInquiryType;
  pharmacyName: string;
  ownerName: string;
  mobile: string;
  email: string;
  city: string;
  branchCount: number;
  message?: string;
  sourcePath?: string;
  website?: string;
}

export interface PublicLeadResponse {
  leadId: string;
  referenceCode: string;
  inquiryType: PublicInquiryType;
  status: 'RECEIVED';
  submittedAt: string;
  message: string;
}

export async function submitPublicLead(payload: PublicLeadPayload): Promise<PublicLeadResponse> {
  const res = await fetch(resolveApiUrl('/api/v1/public/leads'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const firstParamError = Array.isArray(body?.invalidParams) && body.invalidParams[0]?.reason;
    const errMsg =
      firstParamError ||
      body?.detail ||
      body?.message ||
      'Unable to submit your enquiry right now. Please review your details and retry.';
    throw new Error(errMsg);
  }

  return {
    ...(body?.data || {}),
    message:
      body?.message ||
      'Thank you. Your enquiry has been recorded and our team will contact you shortly.',
  };
}
