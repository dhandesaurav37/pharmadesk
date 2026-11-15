import { firestore } from '../lib/firebaseAdmin';
import { logger } from '../lib/logger';

export interface AuditLogEntry {
  id?: string;
  tenantId: string;
  branchId?: string;
  category?: 'security' | 'auth' | 'inventory' | 'billing' | 'khata' | 'procurement' | 'accounting' | 'branch' | 'privacy' | 'dr';
  severity?: 'info' | 'warning' | 'critical';
  requestId?: string;
  actingUserId: string;
  targetUserId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export interface AuditLogQueryFilters {
  action?: string;
  branchId?: string;
  actingUserId?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  limit?: number;
}

const SENSITIVE_EXACT_KEYS = new Set([
  'token',
  'privatekey',
  'apikey',
  'secret',
  'password',
  'allergies',
  'chronicconditions',
  'dateofbirth',
  'dob',
  'accountnumber',
  'upiid',
]);

function maskStringValue(key: string, val: string): string {
  const lower = key.toLowerCase();
  if (lower.includes('phone')) {
    const digits = val.replace(/\D/g, '');
    if (digits.length >= 4) {
      return `***${digits.slice(-4)}`;
    }
    return '***';
  }
  return '[REDACTED]';
}

export function maskAuditMetadata(
  input?: Record<string, unknown>,
  depth = 0
): Record<string, unknown> | undefined {
  if (!input) return undefined;
  if (depth > 4) return { truncated: true };

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase();
    if (
      SENSITIVE_EXACT_KEYS.has(lower) ||
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('privatekey')
    ) {
      clean[key] = typeof value === 'string' ? maskStringValue(key, value) : '[REDACTED]';
      continue;
    }
    if ((lower === 'phone' || lower === 'alternatephone') && typeof value === 'string') {
      clean[key] = maskStringValue(key, value);
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      clean[key] = maskAuditMetadata(value as Record<string, unknown>, depth + 1);
    } else if (Array.isArray(value)) {
      clean[key] = value.slice(0, 25).map((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? maskAuditMetadata(item as Record<string, unknown>, depth + 1)
          : item
      );
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

// In-memory test store for deterministic testing assertions
const testAuditLogs: AuditLogEntry[] = [];

export function getTestAuditLogs(tenantId?: string): AuditLogEntry[] {
  if (!tenantId) return [...testAuditLogs];
  return testAuditLogs.filter((log) => log.tenantId === tenantId);
}

export function clearTestAuditLogs(): void {
  testAuditLogs.length = 0;
}

export class AuditService {
  /**
   * Appends an immutable audit log record to Cloud Firestore.
   */
  public static async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<AuditLogEntry> {
    const timestamp = new Date().toISOString();
    const sanitizedMetadata = maskAuditMetadata(entry.metadata);
    const fullEntry: AuditLogEntry = {
      ...entry,
      metadata: sanitizedMetadata,
      timestamp,
    };

    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (isTestEnv) {
      testAuditLogs.push(fullEntry);
    }

    try {
      const db = firestore();
      const auditRef = db
        .collection('tenants')
        .doc(entry.tenantId)
        .collection('audit_logs')
        .doc();

      fullEntry.id = auditRef.id;

      if (!isTestEnv) {
        await auditRef.set(fullEntry);
      }

      logger.info(
        {
          tenantId: entry.tenantId,
          branchId: entry.branchId,
          actingUserId: entry.actingUserId,
          targetUserId: entry.targetUserId,
          action: entry.action,
        },
        `Audit: ${entry.action}`
      );
    } catch (err: any) {
      // Audit failure should be logged loudly but not break transaction if db offline
      logger.error({ err: err?.message, entry: { tenantId: entry.tenantId, action: entry.action } }, 'Failed to persist audit log entry to Firestore');
    }

    return fullEntry;
  }

  /**
   * Queries immutable audit log entries scoped strictly to the tenant.
   */
  public static async queryLogs(
    tenantId: string,
    filters: AuditLogQueryFilters = {}
  ): Promise<AuditLogEntry[]> {
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

    let entries: AuditLogEntry[] = [];
    if (isTestEnv) {
      entries = testAuditLogs.filter((l) => l.tenantId === tenantId).map((l) => ({ ...l }));
    } else {
      const snap = await firestore()
        .collection('tenants')
        .doc(tenantId)
        .collection('audit_logs')
        .orderBy('timestamp', 'desc')
        .limit(400)
        .get();
      entries = snap.docs.map((d) => ({ id: d.id, ...(d.data() as AuditLogEntry) }));
    }

    if (filters.action && filters.action.trim()) {
      const act = filters.action.trim().toLowerCase();
      entries = entries.filter((e) => e.action.toLowerCase().includes(act));
    }
    if (filters.branchId && filters.branchId !== 'ALL' && filters.branchId !== 'all') {
      entries = entries.filter((e) => !e.branchId || e.branchId === filters.branchId);
    }
    if (filters.actingUserId && filters.actingUserId.trim()) {
      entries = entries.filter((e) => e.actingUserId === filters.actingUserId!.trim());
    }
    if (filters.fromDate && filters.fromDate.trim()) {
      entries = entries.filter((e) => e.timestamp >= filters.fromDate!.trim());
    }
    if (filters.toDate && filters.toDate.trim()) {
      const bound = filters.toDate.trim().length <= 10 ? `${filters.toDate.trim()}T23:59:59.999Z` : filters.toDate.trim();
      entries = entries.filter((e) => e.timestamp <= bound);
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      entries = entries.filter((e) => {
        const metaStr = e.metadata ? JSON.stringify(e.metadata).toLowerCase() : '';
        return (
          e.action.toLowerCase().includes(q) ||
          e.actingUserId.toLowerCase().includes(q) ||
          (e.targetUserId || '').toLowerCase().includes(q) ||
          metaStr.includes(q)
        );
      });
    }

    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return entries.slice(0, limit);
  }
}
