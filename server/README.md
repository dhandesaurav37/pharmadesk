# PharmaDesk Backend Service (Phase 1 Foundation)

**Service:** Express + TypeScript Modular Monolith  
**Status:** Phase 1 Foundation Complete | Phase 2 (PostgreSQL) Pending  
**Engine:** Node.js 22+ / Express 4  
**Target Ingress:** Google Cloud Run (`asia-south1` Mumbai)

---

## 1. Overview & Architectural Boundaries

This directory (`server/`) contains the production-oriented Express + TypeScript backend foundation for **PharmaDesk**. It establishes a reliable, secure server architecture that future phases will extend with PostgreSQL, Firebase Authentication, and pharmacy domain modules.

### Strict Phase 1 Boundaries (What is Intentionally Excluded)
* ❌ **No Database Connection:** PostgreSQL connection pooling, migrations, and Row-Level Security are deferred to **Phase 2**.
* ❌ **No Firebase Admin SDK:** User authentication and token verification are deferred to **Phase 3**.
* ❌ **No Domain Business Logic:** Invoices, batch stock counts, customer Khata, and supplier ledgers belong to later phases.
* ❌ **No Mock / Fake Credentials:** No placeholder secrets or dummy database URLs are configured.

---

## 2. Directory Structure

```
server/
  src/
    app.ts                   # Express application factory (middleware, routes, error handling)
    server.ts                # HTTP server bootstrap, port binding & graceful shutdown
    config/
      env.ts                 # Zod-validated environment configuration with fail-fast parsing
      cors.ts                # CORS options, allowed origins & credentials configuration
    middleware/
      requestId.ts           # Request ID & correlation tracking (X-Request-ID / UUID v4)
      errorHandler.ts        # Centralized RFC 7807 Problem Details error handler
      notFound.ts            # 404 handler for unknown endpoints
    routes/
      index.ts               # Versioned root API router (/api/v1 metadata)
      health.routes.ts       # /health/live and /health/ready container probes
    lib/
      logger.ts              # Structured Pino logger with sensitive field redaction
      errors.ts              # Typed RFC 7807 error hierarchy (AppError, ValidationError, etc.)
      asyncHandler.ts        # Async route handler error forwarding wrapper
    types/
      express.d.ts           # Express Request interface augmentations (req.id, req.startTime)
  tests/
    health.test.ts           # Unit & integration tests for health probes and API metadata
    errors.test.ts           # Tests for RFC 7807 errors, CORS, rate limiting, and request IDs
  tsconfig.json             # Backend TypeScript compiler configuration
```

---

## 3. Running the Backend Locally

### Prerequisites
* Node.js 20+
* Dependencies installed (`npm install`)

### Available Commands
```bash
# Run backend in development mode with live TypeScript reload
npm run dev:backend

# Run backend test suite (Vitest + Supertest)
npm run test:backend

# Type check backend code
npx tsc -p server/tsconfig.json --noEmit

# Type check both frontend and backend
npm run typecheck

# Full repository validation (Lint, Tests, Frontend Build)
npm run validate
```

---

## 4. Available API Endpoints (Phase 1)

All endpoints are mounted under the configurable prefix `/api/v1`:

### 4.1 Liveness Probe
* **Endpoint:** `GET /api/v1/health/live`
* **Purpose:** Verifies the process is alive. Used by container orchestrators (Cloud Run / Kubernetes).
* **Response (200 OK):**
  ```json
  {
    "status": "healthy",
    "timestamp": "2026-11-05T02:00:00.000Z",
    "uptimeSeconds": 42,
    "checks": {
      "process": "alive"
    }
  }
  ```

### 4.2 Readiness Probe
* **Endpoint:** `GET /api/v1/health/ready`
* **Purpose:** Verifies that the server has completed initialization and is ready to accept requests.
* **Response (200 OK):**
  ```json
  {
    "status": "ready",
    "timestamp": "2026-11-05T02:00:00.000Z",
    "uptimeSeconds": 42,
    "dependencies": {
      "server": "initialized",
      "postgresql": "not_configured (Phase 2 pending)",
      "firebaseAuth": "not_configured (Phase 3 pending)"
    }
  }
  ```

### 4.3 Root API Metadata
* **Endpoint:** `GET /api/v1`
* **Purpose:** Basic API metadata, version, and availability.
* **Response (200 OK):**
  ```json
  {
    "name": "PharmaDesk Backend API",
    "version": "1.0.0",
    "phase": "Phase 1 - Backend Foundation",
    "status": "operational",
    "region": "asia-south1",
    "environment": "development",
    "documentation": "https://github.com/dhandesaurav52/pharmadesk/tree/main/docs"
  }
  ```

---

## 5. RFC 7807 Problem Details Error Format

All error responses strictly follow the **RFC 7807 Problem Details** standard with `Content-Type: application/problem+json`:

```json
{
  "type": "https://pharmadesk.in/errors/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "The provided request parameters failed validation criteria.",
  "instance": "/api/v1/onboarding/pharmacy",
  "requestId": "96bbdbb8-8e10-46ab-82c4-723c7f07127e",
  "invalidParams": [
    {
      "name": "pharmacyName",
      "reason": "Pharmacy name must be at least 3 characters"
    }
  ]
}
```

### Security Rule on Errors
Internal stack traces, database connection strings, and server-side secret values are **strictly redacted** and never delivered in HTTP response payloads. Diagnostic stack traces are logged server-side via Pino with correlation `requestId` tags.

---

## 6. Logging & Data Privacy Policy

The backend implements structured logging with **Pino**:
1. **JSON Structured Logs:** Standard in production environments for Cloud Logging ingestion in Google Cloud Run.
2. **Human-Readable Logs:** Colorized output in local development environments.
3. **Automatic Redaction:** Sensitive keys are automatically replaced with `[REDACTED]`:
   * Authorization tokens (`req.headers.authorization`)
   * Session cookies (`req.headers.cookie`)
   * Passwords, OTPs, PINs (`req.body.password`, `req.body.otp`, `*.password`)
   * Patient health information (`req.body.prescriptionDocUrl`, `req.body.doctorRegNumber`)
   * Payment card numbers and CVV codes

---

## 7. How Phase 2 Will Introduce PostgreSQL Safely

Phase 2 will introduce the database layer according to `docs/database-schema.md` without compromising stability:
1. **Connection Pool (`server/src/db/pool.ts`):** Connection pool using `pg.Pool` targeting Cloud SQL private IP.
2. **Role Separation:**
   * Schema migrations run under `pharmadesk_migrator` (DDL owner with `BYPASSRLS`).
   * Runtime queries run under `pharmadesk_app` (owns zero tables, strictly NO `BYPASSRLS`).
3. **Transaction Context Wrapper (`server/src/middleware/tenantContext.ts`):** Applies transaction-scoped `SET LOCAL app.current_tenant_id` and `SET LOCAL app.current_branch_id` on every checkout.
4. **Health Probe Transition:** `GET /api/v1/health/ready` will be updated to execute `SELECT 1` to verify live database connectivity.
