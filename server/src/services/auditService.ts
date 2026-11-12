import { firestore } from '../lib/firebaseAdmin';
import { logger } from '../lib/logger';

export interface AuditLogEntry {
  id?: string;
  tenantId: string;
  actingUserId: string;
  targetUserId?: string;
  action: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
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
    const fullEntry: AuditLogEntry = {
      ...entry,
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
          actingUserId: entry.actingUserId,
          targetUserId: entry.targetUserId,
          action: entry.action,
        },
        `Audit: ${entry.action}`
      );
    } catch (err: any) {
      // Audit failure should be logged loudly but not break transaction if db offline
      logger.error({ err: err?.message, entry }, 'Failed to persist audit log entry to Firestore');
    }

    return fullEntry;
  }
}
