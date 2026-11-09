# PharmaDesk Backend Service (Phase 2 Database & Multi-Tenant Isolation)

**Service:** Express + TypeScript Modular Monolith  
**Status:** Phase 1 Foundation Complete | Phase 2 (PostgreSQL & Multi-Tenancy) Complete | Phase 3 (Firebase Auth) Pending  
**Engine:** Node.js 22+ / Express 4 / PostgreSQL 16+  
**Target Ingress:** Google Cloud Run (`asia-south1` Mumbai)  
**Target Database:** PostgreSQL 16 on Google Cloud SQL (`asia-south1`)

---

## 1. Overview & Architectural Boundaries

This directory (`server/`) contains the production-oriented Express + TypeScript backend foundation for **PharmaDesk**. It establishes a reliable, secure server architecture with hardened multi-tenant database isolation.

### Phase 2 Database Achievements
* ✅ **PostgreSQL 16 Connection Pool:** Production-ready `pg.Pool` with connection lifecycle logging and graceful shutdown (`server/src/db/pool.ts`).
* ✅ **Zero Cross-Tenant Leakage:** Enforced via composite keys `(tenant_id, id)` and composite foreign keys across all tenant tables.
* ✅ **PostgreSQL Row-Level Security (RLS):** Fail-closed `RESTRICTIVE` policies on all tenant tables with `FORCE ROW LEVEL SECURITY`.
* ✅ **Safe Transaction Scoping:** `withTenantTransaction` applies `SET LOCAL app.current_tenant_id = $1` and `SET LOCAL app.current_branch_id = $1` without connection-destructive `DISCARD ALL`.
* ✅ **SQL-First Migration Runner:** Zero-ORM migration engine with SHA-256 checksum drift detection (`server/src/db/migrationRunner.ts`).
* ✅ **44 Relational Tables Across 8 Domains:** Complete normalized DDL in `server/src/db/migrations/0001_initial_schema.sql` through `0005_roles_and_privileges.sql`.
* ✅ **Statutory Invariants & Triggers:** Negative stock prevention, sales invoice immutability, and double-entry journal balance enforcement.
* ✅ **Role Segregation:** DDL owner `pharmadesk_migrator` (with `BYPASSRLS`) vs application runtime role `pharmadesk_app` (NO `BYPASSRLS`, NO `SUPERUSER`).

---

## 2. Directory Structure

```
server/
  scripts/
    migrate.ts               # CLI runner to execute pending SQL migrations
    migration-status.ts      # CLI reporter for migration status and checksum integrity
    db-check.ts              # CLI tester for database connectivity and latency
  src/
    app.ts                   # Express application factory (middleware, routes, error handling)
    server.ts                # HTTP server bootstrap, port binding & graceful shutdown
    config/
      env.ts                 # Zod-validated environment configuration (server & PostgreSQL)
      cors.ts                # CORS options, allowed origins & credentials configuration
    db/
      pool.ts                # PostgreSQL connection pool singleton & lifecycle logging
      connection.ts          # Database health check (dbCheck) & latency monitoring
      transaction.ts         # Generic transaction wrapper (BEGIN, COMMIT, ROLLBACK)
      tenantTransaction.ts   # Tenant-isolated transaction wrapper (SET LOCAL tenant/branch)
      migrationTypes.ts      # TypeScript interfaces for migration files and runner
      migrationRunner.ts     # Migration runner with SHA-256 checksum verification
      migrations/
        0001_initial_schema.sql       # 44 tables, indexes, and reference seeds
        0002_tenant_constraints.sql   # Composite foreign keys (tenant_id, parent_id)
        0003_row_level_security.sql   # Fail-closed RLS policies with FORCE ROW LEVEL SECURITY
        0004_integrity_triggers.sql   # Statutory invoice immutability, negative stock & balance
        0005_roles_and_privileges.sql # Migrator vs Runtime least-privilege roles
    middleware/
      requestId.ts           # Request ID & correlation tracking (X-Request-ID / UUID v4)
      errorHandler.ts        # Centralized RFC 7807 Problem Details error handler
      notFound.ts            # 404 handler for unknown endpoints
    routes/
      index.ts               # Versioned root API router (/api/v1 metadata)
      health.routes.ts       # /health/live and /health/ready container probes (with DB check)
    lib/
      logger.ts              # Structured Pino logger with sensitive field redaction
      errors.ts              # Typed RFC 7807 error hierarchy (AppError, ValidationError, etc.)
      asyncHandler.ts        # Async route handler error forwarding wrapper
    types/
      express.d.ts           # Express Request interface augmentations (req.id, req.startTime)
  tests/
    database/
      migrations.test.ts     # Unit tests verifying migration DDL, checksums, and constraints
      tenantContext.test.ts  # Tests for UUID validation and transaction guards
      connection.test.ts     # Tests for pool configuration and dbCheck fallback
      livePostgres.test.ts   # Truthful execution test per Section 19 mandate
    health.test.ts           # Unit & integration tests for health probes and API metadata
    errors.test.ts           # Tests for RFC 7807 errors, CORS, rate limiting, and request IDs
  tsconfig.json             # Backend TypeScript compiler configuration
```

---

## 3. Running Database Operations & Tests

### Database CLI Commands
```bash
# Check PostgreSQL connectivity and latency
npm run db:check

# View schema migration status and SHA-256 checksum verification
npm run db:status

# Apply pending SQL migrations sequentially
npm run db:migrate
```

### Local Development with Docker
To start a local PostgreSQL 16 container:
```bash
docker-compose up -d
npm run db:check
npm run db:migrate
```

### Test Suite Execution
```bash
# Run all backend unit & integration tests (33 passing tests)
npm run test:backend

# Full repository validation (Lint, Tests, Frontend Build)
npm run validate
```

---

## 4. API Health Probes

Mounted under `/api/v1`:

### 4.1 Liveness Probe (`GET /api/v1/health/live`)
* Confirms Node.js event loop is responsive. Independent of database connectivity.

### 4.2 Readiness Probe (`GET /api/v1/health/ready`)
* Dynamically performs lightweight query ping (`SELECT 1`) when database is configured.
* Returns `200 OK` when healthy, or `503 Service Unavailable` if database is configured but unreachable.
* When database parameters are not set, accurately reports `{ postgresql: 'not_configured' }`.
