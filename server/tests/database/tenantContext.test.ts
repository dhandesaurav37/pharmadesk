import { describe, it, expect } from 'vitest';
import { isValidUuid, withTenantTransaction } from '../../src/db/tenantTransaction.js';

describe('Tenant Context & Transaction Primitives', () => {
  describe('isValidUuid', () => {
    it('should return true for valid RFC 4122 v4 UUIDs', () => {
      expect(isValidUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true);
      expect(isValidUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('should return false for invalid UUIDs or injection strings', () => {
      expect(isValidUuid('')).toBe(false);
      expect(isValidUuid('   ')).toBe(false);
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid('12345')).toBe(false);
      expect(isValidUuid("'; DROP TABLE users; --")).toBe(false);
      expect(isValidUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11; SELECT 1')).toBe(false);
    });
  });

  describe('withTenantTransaction validation guard', () => {
    it('should reject invalid tenantId before attempting database connection', async () => {
      await expect(
        withTenantTransaction({ tenantId: 'malicious-input' }, async () => {})
      ).rejects.toThrow(/Invalid or missing tenantId in tenant transaction context/);

      await expect(
        withTenantTransaction({ tenantId: '' }, async () => {})
      ).rejects.toThrow(/Invalid or missing tenantId in tenant transaction context/);
    });

    it('should reject invalid branchId before attempting database connection', async () => {
      const validTenant = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      await expect(
        withTenantTransaction({ tenantId: validTenant, branchId: 'bad-branch' }, async () => {})
      ).rejects.toThrow(/Invalid branchId format in tenant transaction context/);
    });
  });
});
