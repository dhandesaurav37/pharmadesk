import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';

describe('Firebase Authentication Middleware & Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/v1/auth/me', () => {
    it('should reject requests without Authorization header with 401 Unauthorized', async () => {
      const response = await request(app).get('/api/v1/auth/me');

      expect(response.status).toBe(401);
      expect(response.headers['content-type']).toMatch(/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/unauthorized',
        title: 'Unauthorized',
        status: 401,
      });
      expect(response.body.detail).toContain('Missing or malformed Authorization header');
    });

    it('should reject malformed Authorization headers with 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/unauthorized',
        status: 401,
      });
    });

    it('should reject invalid or expired Firebase tokens with 401 Unauthorized', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token-string-12345');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/unauthorized',
        status: 401,
      });
    });

    it('should accept valid verified Bearer token and return user profile', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-mock-token:pharmacist-uid-101:pharmacist@pharmadesk.in');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('uid', 'pharmacist-uid-101');
      expect(response.body).toHaveProperty('email', 'pharmacist@pharmadesk.in');
      expect(response.body).toHaveProperty('emailVerified', true);
      expect(response.body).toHaveProperty('memberships');
      expect(Array.isArray(response.body.memberships)).toBe(true);
    });
  });
});
