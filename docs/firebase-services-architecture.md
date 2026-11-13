# PharmaDesk Firebase-First Services & Cloud Architecture

**Document Version:** 4.0.0 (Standardized Firebase-Only Production Architecture)  
**Classification:** Cloud Services, Primary Database, Storage, Auth & Hosting Specification  
**Target Platform:** Firebase + Google Cloud Platform (`asia-south1` Mumbai)  
**Primary Database:** Cloud Firestore (Sole Authority for All Business Records)  
**Identity, Storage & Hosting:** Firebase Authentication, Firebase Storage, Firebase Hosting, Google Cloud Run  
**Package Manager:** Bun (`bun.lock`)

---

## 1. Approved Architecture Matrix

PharmaDesk runs exclusively on Firebase managed services paired with a containerized Express + TypeScript API on Google Cloud Run in `asia-south1` (Mumbai). **PostgreSQL and all relational SQL layers are permanently retired.**

| Concern | Standardized Technology | Responsibility |
| :--- | :--- | :--- |
| **Primary Business Database** | **Cloud Firestore** | Sole authoritative data store for tenants, staff memberships, branches, medicines, batches, stock movements, invoices, payments, customers, Khata ledgers, suppliers, procurement, expenses, accounting, reports, audit logs, and subscriptions. |
| **User Authentication** | **Firebase Authentication** | Sole user identity provider (Email/Password, ID tokens). Custom claims are never used as the source of truth for permissions. |
| **Backend API** | **Node.js + Express + TypeScript** | Modular monolith deployed to **Google Cloud Run (`asia-south1`)**. |
| **Backend Auth & Privileges** | **Firebase Admin SDK** | Verifies RS256 ID tokens, verifies App Check tokens, executes atomic Firestore transactions, and signs Storage V4 URLs. |
| **File & Document Storage** | **Firebase Storage** | Tenant- and branch-isolated object storage for invoice PDFs, pharmacy documents, prescriptions, supplier bills, and product images. |
| **Frontend Hosting** | **Firebase Hosting** | Serves the built React 19 + Vite SPA (`dist/`) via global CDN with `/api/**` rewrites to Cloud Run `pharmadesk-api` in `asia-south1`. |
| **Application Security** | **Firestore Rules, Storage Rules, App Check** | Default-deny client security rules, branch-scoped Storage rules, and reCAPTCHA Enterprise client attestation. |
| **Package Manager** | **Bun** | Lockfile-preserving (`bun.lock`) package installation, script execution, testing, and production bundling. |

---

## 2. Cloud Firestore Collection Hierarchy

Every pharmacy tenant is isolated under `/tenants/{tenantId}`:

```text
/users/{userId}                                   [Global user profile mapped to Firebase Auth UID]

/tenants/{tenantId}                               [Pharmacy profile, DL 20B/21B, GSTIN, owner UID, plan]
  /branches/{branchId}                            [Store counters & branch metadata]
  /memberships/{userId}                           [Authoritative role, status, assignedBranchIds, permissionOverrides]
  /invitations/{invitationId}                     [72-hour staff onboarding invite tokens]
  /medicines/{medicineId}                         [Master drug formulary, salt composition, HSN, GST rate, schedule]
  /inventory_batches/{batchId}                    [Batch number, expiryDate, PTR, MRP, sellingPrice, currentStock]
  /stock_movements/{movementId}                   [Append-only immutable stock audit ledger]
  /sales_invoices/{invoiceId}                     [Immutable GST tax invoices, line snapshots, balances]
    /payments/{paymentId}                         [Cash, UPI, Card, Bank Transfer, Khata payment records]
    /returns/{returnId}                           [Sales return credit notes and restock audit]
  /idempotency_keys/{key}                         [SHA-256 payload hash & cached invoice replay]
  /customers/{customerId}                         [Patient profiles, credit limits, Khata balance, advanceBalance]
    /ledger/{entryId}                             [Immutable customer debit/credit ledger entries]
    /payments/{paymentId}                         [Khata repayment receipts & FIFO invoice allocations]
  /suppliers/{supplierId}                         [Stockist profiles, DL/GSTIN, outstanding payables]
  /purchase_orders/{poId}                         [Distributor purchase orders]
  /goods_receipts/{receiptId}                     [Inward stockist invoice receipts]
  /expenses/{expenseId}                           [Operating expenses]
  /accounting_records/{entryId}                   [Daily register & financial accounting entries]
  /reports/{reportId}                             [Statutory GST/Schedule H1 summary snapshots]
  /subscriptions/{subscriptionId}                 [SaaS plan status & billing cycle]
  /audit_logs/{logId}                             [Immutable security & statutory audit trail]
```

### Mandatory Data Governance Rules
1. **No Browser Business Persistence:** `localStorage` and `IndexedDB` must never be used as a replacement for Cloud Firestore for business records.
2. **Admin SDK-Only Authoritative Writes:** `firestore.rules` denies all direct client writes (`allow write: if false;`) on authoritative collections (`tenants`, `branches`, `memberships`, `invitations`, `medicines`, `inventory_batches`, `stock_movements`, `sales_invoices`, `payments`, `returns`, `customers`, `suppliers`, `audit_logs`) and denies all client reads/writes on `idempotency_keys` and `counters`. All mutations flow through validated Express + Firebase Admin SDK transactions.
3. **ACID Read-Before-Write Transactions & Bounds:** Checkout decrements (capped at 50 line items to stay safely below Firestore's 500-operation transaction limit), invoice counter increments, balance payments, sales returns, invoice cancellations, and inventory adjustments execute inside a single `db.runTransaction` with all reads completed before any write.
4. **Branch-Scoped Idempotency & Immutability:** `idempotency_keys` are scoped by operation (`checkout`, `payment`, `return`, `cancel`) and `branchId`. `stock_movements`, `audit_logs`, `payments`, and `returns` are append-only (`INVOICE_CANCEL_REVERSAL` records cancellation stock restocks; expired/damaged returns record zero-delta `EXPIRY`/`DAMAGE` movements without restocking sellable inventory).
5. **Active Tenant & Live Membership Checks:** Every `/api/v1` request verifies `tenants/{tenantId}.status === 'active'` and live `tenants/{tenantId}/memberships/{userId}`; non-owners require explicit non-empty `assignedBranchIds` and cannot hold wildcard permission overrides.

---

## 3. Firebase Storage Isolation & Categories

All files are stored under strict tenant and branch prefixes:
`tenants/{tenantId}/branches/{branchId}/{category}/{fileId}`

Approved categories (`StorageService` & `storage.rules`):
- `invoice_pdfs` — Generated retail GST tax invoice PDFs
- `prescriptions` — Uploaded doctor prescriptions for Schedule H/H1/X dispensing
- `supplier_bills` — Distributor purchase invoices
- `product_images` — Medicine packaging/catalogue images
- `documents` — Drug Licenses (Form 20B/21B), GST certificates, and pharmacy documents

Access is gated by:
1. Express backend validation (`firebaseAuthMiddleware` + `tenantAuthorizationMiddleware`) issuing 15-minute V4 signed URLs.
2. `storage.rules` enforcing `isAllowedCategory(category)` and `hasBranchAccess(tenantId, branchId)` against live Firestore membership documents, plus 15 MB size and PDF/image MIME limits.

---

## 4. Firebase Hosting & Cloud Run Deployment

- **Firebase Hosting (`firebase.json`):** Publishes `dist/`, applies security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), caches immutable Vite assets, and rewrites `/api/**` directly to Cloud Run service `pharmadesk-api` in `asia-south1`.
- **Google Cloud Run (`Dockerfile`):** Builds backend with `bun install --frozen-lockfile && bun run build:backend`, exposes `PORT=8080`, and runs with Workload Identity / Application Default Credentials (zero committed service-account JSON keys).
