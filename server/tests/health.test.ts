import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { Express } from 'express';

describe('Health and API Metadata Endpoints', () => {
  let app: Express;

  beforeAll(() => {
    app = createApp();
  });

  describe('GET /api/v1/health/live', () => {
    it('should return 200 OK with process alive check', async () => {
      const response = await request(app).get('/api/v1/health/live');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/json/);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.uptimeSeconds).toBe('number');
      expect(response.body.checks).toEqual({ process: 'alive' });
    });
  });

  describe('GET /api/v1/health/ready', () => {
    it('should return 200 OK and report Firebase dependencies status', async () => {
      const response = await request(app).get('/api/v1/health/ready');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ready');
      expect(response.body.dependencies).toMatchObject({
        server: 'initialized',
        firebaseAuth: 'ready',
        storage: 'ready',
      });
    });
  });

  describe('GET /api/v1', () => {
    it('should return API metadata without exposing secrets', async () => {
      const response = await request(app).get('/api/v1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'PharmaDesk Backend API');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('phase', 'Phase 3 - Firebase-First Backend & Cloud Firestore Integration');
      expect(response.body).toHaveProperty('status', 'operational');
      expect(response.body).toHaveProperty('primaryDatabase', 'Cloud Firestore');
      expect(response.body).toHaveProperty('identityProvider', 'Firebase Authentication');
      // Assert no secrets leaked
      expect(response.body).not.toHaveProperty('privateKey');
      expect(response.body).not.toHaveProperty('apiKey');
    });
  });

  describe('GET /', () => {
    it('should return root service info', async () => {
      const response = await request(app).get('/');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'PharmaDesk Server');
      expect(response.body).toHaveProperty('status', 'online');
    });
  });
});
