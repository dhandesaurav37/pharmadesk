export interface MigrationFile {
  version: string;
  name: string;
  filename: string;
  fullPath: string;
  sql: string;
  checksum: string;
}

export interface MigrationRecord {
  version: string;
  name: string;
  applied_at: Date;
  checksum: string;
}

export interface MigrationResult {
  appliedCount: number;
  applied: MigrationRecord[];
  skippedCount: number;
}

export interface MigrationStatusItem {
  version: string;
  name: string;
  isApplied: boolean;
  appliedAt?: string;
  diskChecksum: string;
  dbChecksum?: string;
  checksumMatches: boolean;
}
