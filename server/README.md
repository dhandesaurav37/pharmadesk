# PharmaDesk Backend Service (Firebase-First Express API)

**Service:** Express + TypeScript Modular Monolith  
**Status:** Phases 1–6 Complete | Standardized on Firebase + Google Cloud Run (`asia-south1`)  
**Runtime:** Bun (`bun.lock`) / Node.js 22+ / Express 4  
**Primary Database:** Cloud Firestore  
**Identity & Storage:** Firebase Authentication (Admin SDK) + Firebase Storage + Firebase App Check  
**Deployment Target:** Google Cloud Run (`asia-south1` Mumbai)

---

## 1. Overview & Architectural Boundaries

This directory (`server/`) contains the Express + TypeScript backend API for **PharmaDesk**. All business data resides exclusively in **Cloud Firestore** with tenant- and branch-scoped isolation enforced by middleware and Firestore Security Rules.

### Key Implemented Capabilities
* **Firebase Admin SDK Integration (`server/src/lib/firebaseAdmin.ts`):** Unified initialization for Cloud Firestore, Firebase Auth, Firebase Storage, and Firebase App Check.
* **Zero-Trust Auth & Live Membership Authorization:** `firebaseAuthMiddleware` validates RS256 Firebase ID tokens (and App Check tokens when required); `tenantAuthorizationMiddleware` checks live `tenants/{tenantId}/memberships/{userId}` documents in Firestore on every request so deactivated staff are blocked immediately.
* **Branch-Scoped RBAC (`server/src/lib/permissions.ts`):** Evaluates role defaults and per-user permission overrides across `owner`, `pharmacist`, `cashier`, `helper`, and `auditor`.
* **Medicine Catalogue & Batch Inventory:** Master formulary management, batch stock receipts, non-negative stock enforcement, expiry monitoring, valuation reports, and immutable `stock_movements`.
* **Idempotent POS Billing Engine:** FEFO batch allocation, expired batch exclusion, decimal-safe Indian GST (CGST/SGST/IGST), SHA-256 `Idempotency-Key` replay protection, split payments, sales returns, and invoice cancellation.
* **Tenant-Isolated File Storage:** Generates V4 signed URLs via Firebase Storage under `tenants/{tenantId}/branches/{branchId}/{category}/{fileId}`.

---

## 2. Directory Structure

```text
server/
  src/
    app.ts                   # Express application factory (Helmet, CORS, rate limit, routes, RFC 7807 errors)
    server.ts                # HTTP server bootstrap & graceful shutdown
    config/
      env.ts                 # Zod-validated environment configuration (Firebase & Cloud Run)
      cors.ts                # CORS origin and header policy (including X-Firebase-AppCheck, X-Idempotency-Key)
    lib/
      firebaseAdmin.ts       # Firebase Admin SDK singletons (Firestore, Auth, Storage, AppCheck)
      permissions.ts         # RBAC role matrix, aliases, and permission resolver
      errors.ts              # Typed RFC 7807 Problem Details error hierarchy
      logger.ts              # Structured Pino logger with credential/token redaction
      asyncHandler.ts        # Async Express route error forwarding
    middleware/
      firebaseAuth.ts        # Firebase ID token & App Check verification
      tenantAuthorization.ts # Live Firestore tenant membership & branch access check
      requirePermission.ts   # Granular endpoint capability guard
      requestId.ts           # Correlation X-Request-ID assignment
      errorHandler.ts        # RFC 7807 centralized error serializer
      notFound.ts            # 404 handler
    routes/
      index.ts               # Versioned /api/v1 router
      health.routes.ts       # /health/live and /health/ready probes (with Firestore ping)
      auth.routes.ts         # /auth/me identity & active tenant memberships
      tenant.routes.ts       # Tenant onboarding and profile routes
      employee.routes.ts     # Staff invitations, branch assignment, and RBAC routes
      medicine.routes.ts     # Master medicine formulary endpoints
      inventory.routes.ts    # Batch stock, adjustments, movements, expiry, valuation
      billing.routes.ts      # POS checkout, invoices, split payments, returns, cancellations
      storage.routes.ts      # Signed upload/download URL generation for Firebase Storage
    services/
      auditService.ts        # Immutable tenants/{tenantId}/audit_logs writer
      tenantService.ts       # Pharmacy onboarding & branch/member queries
      employeeService.ts     # Invitation tokens & RBAC lifecycle
      medicineService.ts     # Medicine catalogue management
      inventoryService.ts    # Atomic batch stock & movement tracking
      billingTransactionService.ts # Idempotent FEFO POS checkout, GST, payments & returns
      storageService.ts      # Firebase Storage signed URL generator
    types/
      express.d.ts           # Express Request extensions (req.user, req.tenantContext, req.id)
  tests/
    auth.test.ts
    billingTransaction.test.ts
    errors.test.ts
    health.test.ts
    inventory.test.ts
    posBilling.test.ts
    rbac.test.ts
    storage.test.ts
    tenantAuthorization.test.ts
  tsconfig.json
```

---

## 3. Running & Testing with Bun

### Local Development
```bash
# Install dependencies
bun install --frozen-lockfile

# Start Express development server (port 3001)
bun run dev:backend

# Optional: Start local Firebase Emulator Suite (Auth, Firestore, Storage)
docker-compose up -d
```

### Automated Tests & Builds
```bash
# Run all backend test suites
bun run test:backend

# Typecheck & lint
bun run lint

# Build production Cloud Run bundle (dist/server/server.js)
bun run build:backend
```

---

## 4. API Health Probes

Mounted under `/api/v1`:

* **`GET /api/v1/health/live`:** Confirms the Express event loop is responsive.
* **`GET /api/v1/health/ready`:** Performs a lightweight Firestore ping (`health/ping`) and reports `{ firestore, firebaseAuth, storage }`. Returns `200 OK` when ready or `503 Service Unavailable` if Firestore is unreachable outside test mode.
