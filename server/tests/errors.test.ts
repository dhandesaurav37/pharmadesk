import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { validateEnv } from '../src/config/env';
import { Express } from 'express';

describe('Error Handling, Security Middleware and Edge Cases', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('Request ID & Correlation Tracking', () => {
    it('should generate a unique X-Request-ID header when none is provided', async () => {
      const response = await request(app).get('/api/v1');

      expect(response.headers).toHaveProperty('x-request-id');
      expect(response.headers).toHaveProperty('x-correlation-id');
      expect(response.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should preserve and echo a valid incoming X-Request-ID', async () => {
      const customId = 'pharma-trace-client-12345';
      const response = await request(app)
        .get('/api/v1')
        .set('X-Request-ID', customId);

      expect(response.headers['x-request-id']).toBe(customId);
      expect(response.headers['x-correlation-id']).toBe(customId);
    });
  });

  describe('404 Not Found Handling (RFC 7807)', () => {
    it('should return RFC 7807 Problem Details for unknown routes', async () => {
      const response = await request(app).get('/api/v1/unknown-endpoint-route');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/not-found',
        title: 'Not Found',
        status: 404,
      });
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('instance', '/api/v1/unknown-endpoint-route');
      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('Malformed JSON Handling (RFC 7807)', () => {
    it('should return 400 Bad Request with Problem Details when payload JSON is malformed', async () => {
      const response = await request(app)
        .post('/api/v1/test/validation')
        .set('Content-Type', 'application/json')
        .send('{ "pharmacyName": "Broken JSON without closing brace');

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/malformed-json',
        title: 'Malformed JSON Request',
        status: 400,
      });
      expect(response.body).toHaveProperty('detail');
      expect(response.body).toHaveProperty('requestId');
    });
  });

  describe('Validation Error Handling (RFC 7807)', () => {
    it('should return 422 Unprocessable Entity with invalidParams when validation fails', async () => {
      const response = await request(app)
        .post('/api/v1/test/validation')
        .send({
          pharmacyName: 'A', // Too short (min 3)
          pincode: '123',     // Malformed (must be 6 digits)
        });

      expect(response.status).toBe(422);
      expect(response.headers['content-type']).toMatch(/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/validation-error',
        title: 'Validation Error',
        status: 422,
      });
      expect(Array.isArray(response.body.invalidParams)).toBe(true);
      expect(response.body.invalidParams.length).toBeGreaterThanOrEqual(2);

      const fieldNames = response.body.invalidParams.map((p: any) => p.name);
      expect(fieldNames).toContain('pharmacyName');
      expect(fieldNames).toContain('pincode');
    });
  });

  describe('Unexpected Server Error Handling (RFC 7807)', () => {
    it('should return 500 Internal Server Error without leaking stack traces or internal secrets', async () => {
      const response = await request(app).get('/api/v1/test/unexpected-error');

      expect(response.status).toBe(500);
      expect(response.headers['content-type']).toMatch(/problem\+json/);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/internal-server-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected server error occurred. Our engineering team has been notified.',
      });
      expect(response.body).toHaveProperty('requestId');
      // Critical security check: Stack traces must never appear in production API responses
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body.detail).not.toContain('Simulated unexpected backend fault');
    });
  });

  describe('CORS Policy Enforcement', () => {
    it('should allow configured origin and set appropriate CORS headers', async () => {
      const response = await request(app)
        .get('/api/v1')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should reject unauthorized browser origin with 403 Forbidden Problem Details', async () => {
      const customCorsApp = createApp({
        corsAllowedOrigins: ['https://app.pharmadesk.in'],
      });

      const response = await request(customCorsApp)
        .get('/api/v1')
        .set('Origin', 'https://malicious-counterfeit-site.example.com');

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/cors-forbidden',
        title: 'CORS Forbidden',
        status: 403,
      });
    });
  });

  describe('Rate Limiter Behavior', () => {
    it('should enforce rate limits when maximum requests threshold is exceeded', async () => {
      const rateLimitedApp = createApp({
        config: {
          ...validateEnv(),
          RATE_LIMIT_MAX_REQUESTS: 2,
          RATE_LIMIT_WINDOW_MS: 60000,
        },
      });

      // Request 1: OK
      const res1 = await request(rateLimitedApp).get('/api/v1');
      expect(res1.status).toBe(200);

      // Request 2: OK
      const res2 = await request(rateLimitedApp).get('/api/v1');
      expect(res2.status).toBe(200);

      // Request 3: Blocked (429)
      const res3 = await request(rateLimitedApp).get('/api/v1');
      expect(res3.status).toBe(429);
      expect(res3.body).toMatchObject({
        type: 'https://pharmadesk.in/errors/rate-limit-exceeded',
        title: 'Rate Limit Exceeded',
        status: 429,
      });
    });

    it('should never rate-limit health check probes', async () => {
      const strictRateApp = createApp({
        config: {
          ...validateEnv(),
          RATE_LIMIT_MAX_REQUESTS: 1,
        },
      });

      // Exhaust limit on /api/v1
      await request(strictRateApp).get('/api/v1');
      await request(strictRateApp).get('/api/v1');

      // Health check probe MUST still succeed (unthrottled for orchestrator probes)
      const healthRes = await request(strictRateApp).get('/api/v1/health/live');
      expect(healthRes.status).toBe(200);
    });
  });

  describe('Environment Configuration Validation', () => {
    it('should throw fatal validation error when PORT is malformed', () => {
      expect(() => {
        validateEnv({ PORT: 'not-a-number' });
      }).toThrow(/Invalid server environment configuration/);
    });

    it('should throw fatal validation error when PORT is outside valid range', () => {
      expect(() => {
        validateEnv({ PORT: '999999' });
      }).toThrow(/Invalid server environment configuration/);
    });

    it('should throw fatal validation error when API_PREFIX does not start with slash', () => {
      expect(() => {
        validateEnv({ API_PREFIX: 'api/v1' });
      }).toThrow(/Invalid server environment configuration/);
    });
  });
});
