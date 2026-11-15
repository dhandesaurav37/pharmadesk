import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { getTestLeadsSnapshot, resetTestLeadsStore } from '../src/services/leadService';

describe('Phase 13 Public Marketing Lead Intake & Abuse Protection', () => {
  const app = createApp();

  beforeEach(() => {
    resetTestLeadsStore();
  });

  it('stores valid trial/demo enquiries cleanly with normalized Indian mobile and hashed IP', async () => {
    const res = await request(app)
      .post('/api/v1/public/leads')
      .set('User-Agent', 'Vitest-Marketing-Agent/1.0')
      .send({
        inquiryType: 'FREE_TRIAL',
        pharmacyName: 'Arogya Medical & General Store',
        ownerName: 'Mahesh Kulkarni',
        mobile: '9822011223',
        email: 'Mahesh@ArogyaMedical.IN',
        city: 'Pune',
        branchCount: 2,
        message: 'Looking for GST POS billing and FEFO batch expiry alerts.',
        sourcePath: '/',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.referenceCode).toMatch(/^PD-ENQ-[A-F0-9]{6}$/);
    expect(res.body.data.status).toBe('RECEIVED');

    const stored = getTestLeadsSnapshot();
    expect(stored).toHaveLength(1);
    expect(stored[0].normalizedMobile).toBe('+919822011223');
    expect(stored[0].email).toBe('mahesh@arogyamedical.in');
    expect(stored[0].branchCount).toBe(2);
    expect(stored[0].ipHash).toHaveLength(24);
  });

  it('returns 422 Validation Error for malformed mobile numbers, emails, or zero branch count', async () => {
    const res = await request(app).post('/api/v1/public/leads').send({
      inquiryType: 'BOOK_DEMO',
      pharmacyName: 'A',
      ownerName: 'B',
      mobile: '12345',
      email: 'not-an-email',
      city: 'X',
      branchCount: 0,
    });

    expect(res.status).toBe(422);
    expect(res.body.title).toBe('Validation Error');
    expect(getTestLeadsSnapshot()).toHaveLength(0);
  });

  it('rejects automated spam submissions when honeypot field is populated', async () => {
    const res = await request(app).post('/api/v1/public/leads').send({
      inquiryType: 'SALES_ENQUIRY',
      pharmacyName: 'Spam Pharmacy',
      ownerName: 'Bot User',
      mobile: '9822011224',
      email: 'bot@spam.example',
      city: 'Mumbai',
      branchCount: 1,
      website: 'https://spam-links.example',
    });

    expect(res.status).toBe(400);
    expect(getTestLeadsSnapshot()).toHaveLength(0);
  });

  it('prevents duplicate repeat enquiry floods within 5 minutes and blocks public GET access', async () => {
    const payload = {
      inquiryType: 'CALLBACK',
      pharmacyName: 'Janata Chemist',
      ownerName: 'Sunil Patil',
      mobile: '+91 9811122233',
      email: 'sunil@janatachemist.in',
      city: 'Nagpur',
      branchCount: 1,
    };

    const first = await request(app).post('/api/v1/public/leads').send(payload);
    expect(first.status).toBe(201);

    const duplicate = await request(app).post('/api/v1/public/leads').send(payload);
    expect(duplicate.status).toBe(400);

    const listAttempt = await request(app).get('/api/v1/public/leads');
    expect(listAttempt.status).toBe(403);
  });
});
