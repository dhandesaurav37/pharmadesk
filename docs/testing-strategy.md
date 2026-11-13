# PharmaDesk Comprehensive Testing Strategy & Quality Gates

**Document Version:** 2.0.0 (Standardized Firebase-First Testing Strategy)  
**Scope:** Verification Architecture across Auth, Tenant Isolation, RBAC, Inventory, Storage, and POS Billing  
**Test Runner:** Vitest + Supertest executed via Bun (`bun run test`)  

---

## 1. Testing Pyramid & Verification Framework

```text
                      / \
                     /   \
                    / E2E \   (Firebase Emulator Suite + Browser Flows)
                   /-------\
                  /   API   \  (Vitest + Supertest: Express Routes & Middleware)
                 /-----------\
                /  Transact   \ (FEFO, Idempotency, Stock Invariants, GST Math)
               /---------------\
              /   Unit & Rules  \ (TypeScript Strict Checks + Security Rules)
             +-------------------+
```

---

## 2. Implemented Backend Automated Test Suites (`server/tests/`)

| Suite File | Domain Covered | Key Verifications |
| :--- | :--- | :--- |
| `health.test.ts` | Health Probes & API Metadata | `/api/v1/health/live`, `/api/v1/health/ready` (`firestore`, `firebaseAuth`, `storage`), API phase & platform metadata without secret leaks |
| `errors.test.ts` | RFC 7807 Error & Security | Zod 422 formatting, 404 handling, CORS origin checking, `X-Request-ID` propagation, rate-limit headers |
| `auth.test.ts` | Firebase Authentication | Missing/malformed bearer tokens, `/api/v1/auth/me` verification |
| `tenantAuthorization.test.ts` | Multi-Tenant & Branch Isolation | Unknown tenant rejection, non-member 403, deactivated staff immediate block, unauthorized branch rejection |
| `rbac.test.ts` | Staff RBAC & Invitations | Owner/Pharmacist/Cashier/Helper/Auditor permission matrices, overrides, 72h invitation acceptance, self-deactivation prevention |
| `inventory.test.ts` | Medicine & Batch Inventory | Formulary creation, duplicate prevention, opening stock, negative stock 409/422 prevention, expiry alerts, PTR valuation protection |
| `storage.test.ts` | Firebase Storage Isolation | Tenant/branch-scoped V4 signed URL generation across `invoice_pdfs`, `prescriptions`, `supplier_bills`, `product_images`, `documents`; executable MIME rejection |
| `billingTransaction.test.ts` | Billing Input Validation | Missing `Idempotency-Key` 400 rejection, empty cart 422, negative quantity rejection |
| `posBilling.test.ts` | Phase 6 POS & Idempotency Engine | FEFO split-batch allocation, expired batch exclusion, negative stock blocking, CGST/SGST vs IGST after discounts, canonical SHA-256 idempotency replay & 409 conflict, split payments & balance collection, sales returns & restock, invoice cancellation, RBAC enforcement |

---

## 3. Running Tests & Validation with Bun

```bash
# Run full backend and unit test suite
bun run test

# Run backend API suites explicitly
bun run test:backend

# Run TypeScript typechecking across frontend and backend
bun run lint

# Run complete validation gate (Lint + Tests + Frontend Build + Backend Build)
bun run validate
```

### Firebase Emulator Integration Testing
For live emulator verification against `firebase.json` ports (`Auth: 9099`, `Firestore: 8080`, `Storage: 9199`):
```bash
docker-compose up -d
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 bun run dev:backend
```

---

## 4. Quality Release Gates

### Gate 1: Pull Request CI (`.github/workflows/backend-ci.yml`)
- Executed automatically on Bun (`bun install --frozen-lockfile`).
- Passes `bun run typecheck`, `bun run lint`, `bun run test:backend`, `bun run build:backend`, and `bun run build:frontend`.

### Gate 2: Staging Verification (Firebase Emulator / Staging Project)
- Deploy `firestore.rules`, `firestore.indexes.json`, and `storage.rules` to staging.
- Verify Cloud Run `asia-south1` `/api/v1/health/ready` reports `firestore.status = "connected"`.
- Verify idempotent checkout (`X-Cache: HIT`) and concurrent FEFO transactions under load.

### Gate 3: Production Release
- Confirm `FIREBASE_APP_CHECK_REQUIRED=true` on Cloud Run.
- Verify scheduled Firestore exports and Point-in-Time Recovery (PITR) are enabled in `asia-south1`.
- Complete statutory review of Schedule H1 registers and GST invoice outputs.
