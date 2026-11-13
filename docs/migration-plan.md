# PharmaDesk Prototype-to-Cloud Migration Strategy

**Document Version:** 3.0.0 (Standardized Firebase-First Cloud Migration)  
**Scope:** Transition from Ephemeral UI Seed Data to Cloud Firestore, Firebase Auth, and Firebase Storage  
**Principle:** Zero Business Data in Browser `localStorage` / `IndexedDB` and Verifiable Cloud Persistence  

---

## 1. Architecture Transition Overview

Earlier prototype builds stored UI preview records in browser `localStorage`. In the standardized architecture:
- **Browser Storage Policy:** `localStorage` and `IndexedDB` are strictly prohibited from acting as a persistence store for pharmacy business records. `PharmacyContext` maintains only ephemeral React session state in preview mode while all authoritative persistence runs through Express `/api/v1` to **Cloud Firestore** and **Firebase Storage**.
- **Identity Provider:** **Firebase Authentication** replaces all prototype role-switchers in production, with Express validating ID tokens via Firebase Admin SDK and resolving live memberships from `tenants/{tenantId}/memberships/{userId}`.

---

## 2. Entity-to-Firestore Collection Mapping

| Frontend Action / Context | Target REST API Endpoint | Authoritative Firestore Collection / Storage |
| :--- | :--- | :--- |
| `updateStore(data)` | `PATCH /api/v1/tenants/:tenantId` | `tenants/{tenantId}`, `branches/{branchId}` |
| `addMedicine(med)` | `POST /api/v1/medicines` | `tenants/{tenantId}/medicines/{medicineId}` |
| `addInventoryBatch(batch)` | `POST /api/v1/inventory/opening-stock` | `tenants/{tenantId}/inventory_batches`, `stock_movements` |
| `adjustBatchStock(...)` | `POST /api/v1/inventory/adjustments` | `tenants/{tenantId}/inventory_batches`, `stock_movements` |
| `createBill(billData)` | `POST /api/v1/pos/checkout` | `tenants/{tenantId}/sales_invoices`, `payments`, `idempotency_keys`, `stock_movements` |
| `recordBillPayment(...)` | `POST /api/v1/invoices/:id/payments` | `tenants/{tenantId}/sales_invoices/{id}/payments` |
| `processSalesReturn(...)` | `POST /api/v1/invoices/:id/returns` | `tenants/{tenantId}/sales_invoices/{id}/returns`, `stock_movements` |
| `cancelBill(...)` | `POST /api/v1/invoices/:id/cancel` | `tenants/{tenantId}/sales_invoices/{id}`, `audit_logs` |
| `inviteEmployee(...)` | `POST /api/v1/tenants/:tenantId/invitations` | `tenants/{tenantId}/invitations`, `audit_logs` |
| `addCustomer` / `updateCustomerKhata` | `POST /api/v1/customers` (Phase 7) | `tenants/{tenantId}/customers`, `khata_ledger` |
| `addSupplier` / `goodsReceipt` | `POST /api/v1/suppliers` (Phase 8) | `tenants/{tenantId}/suppliers`, `purchase_orders`, `goods_receipts` |
| Upload Rx / Invoice PDFs | `POST /api/v1/tenants/:tenantId/storage/upload-url` | Firebase Storage `tenants/{tenantId}/branches/{branchId}/{category}/{fileId}` |

---

## 3. Cloud Onboarding & Pilot Cutover Checklist

1. **Provision Firebase Project (`pharmadesk-cloud`, `asia-south1`):**
   - Enable Firebase Authentication (Email/Password), Cloud Firestore (Native Mode in `asia-south1`), Firebase Storage, Firebase Hosting, and Firebase App Check.
2. **Deploy Security Rules & Indexes:**
   ```bash
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```
3. **Deploy Backend to Google Cloud Run (`asia-south1`):**
   - Build via `Dockerfile` (`bun install --frozen-lockfile && bun run build:backend`) and deploy with `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, and `FIREBASE_APP_CHECK_REQUIRED=true`.
4. **Deploy Frontend to Firebase Hosting:**
   ```bash
   bun run build:frontend
   firebase deploy --only hosting
   ```
5. **Pilot Pharmacy Data Import:**
   - Authenticate pharmacy owner via Firebase Authentication.
   - Run `POST /api/v1/tenants` onboarding to create tenant root, main branch, and owner membership.
   - Bulk-import master medicines and opening stock batches via `/api/v1/medicines` and `/api/v1/inventory/opening-stock`, verifying batch totals against physical shelf stock.
