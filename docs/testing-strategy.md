# PharmaDesk Comprehensive Testing Strategy & Quality Gates

**Document Version:** 5.0.0 (Standardized Firebase-First Testing Strategy — Phase 10 Included)  
**Scope:** Verification Architecture across Auth, Tenant Isolation, RBAC, Inventory, Storage, POS Billing, Customers & Khata, Suppliers & Procurement, Double-Entry Accounting, and Multi-Branch & Stock Transfers  
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

## 2. Implemented Backend Automated Test Suites (`server/tests/` — 15 Files, 140 Tests)

| Suite File | Domain Covered | Key Verifications |
| :--- | :--- | :--- |
| `health.test.ts` | Health Probes & API Metadata | `/api/v1/health/live`, `/api/v1/health/ready` (`firestore`, `firebaseAuth`, `storage`), API phase (`Phase 10`) & platform metadata without secret leaks |
| `errors.test.ts` | RFC 7807 Error & Security | Zod 422 formatting, 404 handling, CORS origin checking, `X-Request-ID` propagation, rate-limit headers |
| `auth.test.ts` | Firebase Authentication | Missing/malformed bearer tokens, `/api/v1/auth/me` verification |
| `firebaseAdmin.test.ts` | Admin SDK Initialization | Singleton initialization, partial credential & PEM validation, fail-closed `NODE_ENV=production` credential requirement, storage signed URL test guard |
| `tenantAuthorization.test.ts` | Multi-Tenant & Branch Isolation | Unknown tenant rejection, suspended/inactive tenant 403 block, non-member 403, deactivated staff immediate block, non-owner empty/`'*'` branch rejection |
| `rbac.test.ts` | Staff RBAC & Invitations | Owner/Pharmacist/Cashier/Helper/Auditor permission matrices, wildcard override rejection for non-owners, transactional 72h invitation acceptance, self-deactivation prevention |
| `inventory.test.ts` | Medicine & Batch Inventory | Formulary creation, duplicate prevention, opening stock, transactional negative stock 409/422 prevention, expiry alerts, PTR valuation protection |
| `storage.test.ts` | Firebase Storage Isolation | Tenant/branch-scoped V4 signed URL generation across `invoice_pdfs`, `prescriptions`, `supplier_bills`, `product_images`, `documents`; executable MIME rejection |
| `billingTransaction.test.ts` | Billing Input Validation | Missing `Idempotency-Key` 400 rejection, empty cart 422, negative quantity rejection |
| `posBilling.test.ts` | Phase 6 POS & Idempotency Engine | FEFO split-batch allocation, duplicate-line working-stock safety, `>50` item checkout limit, expired batch exclusion, negative stock blocking, CGST/SGST vs IGST, branch-scoped idempotency across checkout/payments/returns/cancel (`X-Cache: HIT` & `409`), overpayment `400` rejection, damaged/expired return quarantine, `INVOICE_CANCEL_REVERSAL` + `refundStatus`, RBAC enforcement |
| `customers.test.ts` | Phase 7 Customers & Khata Ledger | Customer CRUD, Indian `+91` phone normalization, duplicate phone `409` vs `confirmSharedPhone`, `customers.view_phone` masking (`auditor`) & `helper` denial, non-zero balance archive block, paise ledger reconciliation, concurrent credit limit & `customers.credit_override`, FIFO & targeted Khata settlements, idempotent double-deduction prevention, auto-applied `advanceBalance`, POS split Khata checkout + return/cancellation `CREDIT_NOTE` reversals, CSV/`%PDF-1.4` exports, sanitized clinical-free WhatsApp summaries, overdue aging buckets |
| `suppliersProcurement.test.ts` | Phase 8 Suppliers, POs, GRNs & Payables | Supplier CRUD/GSTIN/PAN/Indian phone checks, duplicate `409` vs `confirmDuplicate`, RBAC financial/bank redaction, block/reactivation/archive guards, intra-state CGST+SGST & inter-state IGST PO engine, concurrent PO approval lock, GRN batch split/rejected/expired/short-expiry/over-receipt, GRN idempotency & concurrent receiving lock, auditable reversal & consumed-batch `409` guard, single-liability invoice uniqueness, FIFO/advance payments, supplier returns & credit notes, CSV/`%PDF-1.4` statements, procurement reports |
| `accounting.test.ts` | Phase 9 Double-Entry Accounting & Reports | Default CoA seeding, custom accounts & used-account deletion guard, balanced journal enforcement, immutable vouchers & audited reversals, absence of public `POST /journal-entries`, POS sale/return/cancel GL postings, Khata settlement journals, GRN clearing (`2110`) to AP (`2100`) & supplier payments/returns, pharmacist expense submit -> owner approve/pay/reverse workflow, contra cash/bank transfers, CSV/JSON bank statement import & voucher matching, period lock backdated blocking & audited reopen, GL-vs-subledger exception detection & idempotent backfill, Trial Balance, P&L, Branch P&L, Balance Sheet (`Assets === Liabilities + Equity`), Cash Flow, Cash/Bank Books, GST Summary disclaimer, CSV/`%PDF-1.4` exports, RBAC matrix (`owner`/`pharmacist`/`auditor`/`cashier`/`helper`) & tenant isolation |
| `branchesAndTransfers.test.ts` | Phase 10 Multi-Branch, Transfers & Consolidated Reports | Branch CRUD, duplicate `branchCode` `409`, policy updates, primary promotion, `SUSPENDED`/`CLOSED` mutation blocking (`requireActiveBranchMiddleware`) vs historical `GET` reads, controlled closure readiness & permanent `CLOSED` enforcement, cross-tenant & branch-staff RBAC + last-branch removal protection, expired/insufficient stock blocking, self-approval rejection, source/destination dispatch/receive access checks, partial dispatch/receipt, discrepancy reason enforcement, `1450 Stock in Transit` & `5280` shrinkage GL verification with zero revenue/COGS/GST, idempotent retry safety, concurrent bidirectional locking, branch comparison, consolidated overview with eliminations, and CSV/`%PDF-1.4` exports |
| `securityRulesAndCleanup.test.ts` | Security Rules & Zero-PostgreSQL Gate | Zero `pg`/SQL packages or imports in repo, fail-closed `firestore.rules` (Phases 6–10 collections + internal `purchaseOperations`, `accountingOperations`, `branchOperations`, `idempotency_keys`, `counters`), `storage.rules` & `firestore.indexes.json` assertions |

---

## 3. Running Tests & Validation with Bun

```bash
# Run full backend and unit test suite
bun run test

# Run backend API suites explicitly
bun run test:backend

# Run TypeScript typechecking across frontend and backend
bun run typecheck
bun run lint

# Run complete validation gate (Typecheck + Lint + Tests + Frontend Build + Backend Build)
bun run validate
```

### Firebase Emulator Integration Testing
For live emulator verification against `firebase.json` ports (`Auth: 9099`, `Firestore: 8080`, `Storage: 9199`) — requires a local Java (`>= 17`) runtime:
```bash
docker-compose up -d
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 bun run dev:backend
```
*(In headless container environments without Java, `firestore.rules`, `storage.rules`, and Admin SDK behavior are verified statically and structurally via `securityRulesAndCleanup.test.ts` and `firebaseAdmin.test.ts`, with live Emulator Suite verification deferred to CI/staging with Java available.)*

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
