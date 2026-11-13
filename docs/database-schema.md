# PharmaDesk Cloud Firestore Data Schema & Isolation Model

**Document Version:** 3.0.0 (Standardized Cloud Firestore Architecture)  
**Primary Database:** Cloud Firestore (Region: `asia-south1` Mumbai)  
**Isolation Model:** Tenant Subcollection Hierarchy (`/tenants/{tenantId}/...`) + Fail-Closed Security Rules + Live Server Authorization  
**Precision Standard:** Monetary values rounded to paise (`roundPaise`, 2 decimal places)  

---

## 1. Architectural Principles

Cloud Firestore is the **sole authoritative business database** for PharmaDesk.
- Every tenant-owned entity resides beneath `/tenants/{tenantId}/...`, making cross-tenant path traversal structurally impossible without explicit tenant authorization.
- Multi-document stock decrements, invoice numbering, and idempotency checks execute inside Firestore ACID `runTransaction` blocks.
- Security Rules (`firestore.rules`) deny all access by default (`allow read, write: if false`) and verify active membership (`status == 'active'`) and branch assignment (`assignedBranchIds`) against `/tenants/{tenantId}/memberships/{uid}`.
- Client-side `localStorage` or `IndexedDB` is never used to store permanent business records.

---

## 2. Global Identity Collection

### 2.1 `users/{userId}`
Global user directory keyed by Firebase Authentication UID.
- **Fields:** `uid` (string), `email` (string), `displayName` (string), `phoneNumber` (string | null), `pharmacistRegNumber` (string | null), `lastActiveTenantId` (string | null), `createdAt` (ISO timestamp), `updatedAt` (ISO timestamp).

---

## 3. Tenant Root & Access Control Collections

### 3.1 `tenants/{tenantId}`
- **Fields:** `id`, `name`, `legalName`, `dlNumber20B`, `dlNumber21B`, `gstin`, `pan`, `address`, `city`, `state`, `pincode`, `contactPhone`, `contactEmail`, `ownerId`, `status` (`active` | `suspended` | `cancelled`), `plan` (`standard` | `growth` | `enterprise`), `createdAt`, `updatedAt`.

### 3.2 `tenants/{tenantId}/branches/{branchId}`
- **Fields:** `id`, `tenantId`, `name`, `branchCode`, `address`, `isMain` (boolean), `status` (`active` | `inactive`), `createdAt`, `updatedAt`.

### 3.3 `tenants/{tenantId}/memberships/{userId}`
Authoritative RBAC and branch access record evaluated on every API call.
- **Fields:** `tenantId`, `userId` (Firebase Auth UID), `name`, `email`, `phone`, `role` (`owner` | `pharmacist` | `cashier` | `helper` | `auditor`), `status` (`active` | `invited` | `deactivated` | `suspended`), `assignedBranchIds` (`string[]`, e.g. `["main"]` or `["*"]`), `permissions` (`string[]`), `permissionOverrides` (`{ granted: string[], revoked: string[] }`), `invitedBy`, `statusUpdatedBy`, `createdAt`, `updatedAt`.

### 3.4 `tenants/{tenantId}/invitations/{invitationId}`
- **Fields:** `id`, `tenantId`, `email`, `name`, `phone`, `role`, `assignedBranchIds`, `permissionOverrides`, `token` (cryptographic random string), `status` (`pending` | `accepted` | `expired` | `cancelled` | `revoked`), `expiresAt` (72-hour TTL), `createdAt`, `createdBy`, `acceptedByUserId`, `acceptedAt`.

---

## 4. Medicine Formulary & Batch Inventory Collections

### 4.1 `tenants/{tenantId}/medicines/{medicineId}`
- **Fields:** `id`, `tenantId`, `name` (brand/trade name), `genericName` (salt formulation), `brand` (manufacturer), `category`, `dosageForm`, `strength`, `packSize`, `uom`, `hsnCode`, `gstRate` (`0 | 5 | 12 | 18 | 28`), `barcode`, `prescriptionRequired` (boolean), `schedule` (`OTC` | `H` | `H1` | `X`), `minStockThreshold` (number), `description`, `status` (`active` | `inactive` | `archived`), `createdBy`, `createdAt`, `updatedAt`.

### 4.2 `tenants/{tenantId}/inventory_batches/{batchId}`
- **Fields:** `id`, `tenantId`, `branchId`, `medicineId`, `medicineName`, `genericName`, `batchNumber`, `manufacturingDate`, `expiryDate` (`YYYY-MM` or `YYYY-MM-DD`), `purchasePrice` (PTR), `mrp`, `sellingPrice`, `quantityReceived`, `currentStock` (strictly `>= 0`), `freeQuantity`, `supplierId`, `supplierName`, `rackLocation`, `barcode`, `status` (`normal` | `low_stock` | `near_expiry` | `expired` | `out_of_stock`), `createdAt`, `updatedAt`.
- **Composite Indexes (`firestore.indexes.json`):** `(branchId ASC, status ASC, expiryDate ASC)`, `(medicineId ASC, expiryDate ASC)`.

### 4.3 `tenants/{tenantId}/stock_movements/{movementId}` (Immutable Append-Only)
- **Fields:** `id`, `tenantId`, `branchId`, `medicineId`, `batchId`, `batchNumber`, `medicineName`, `movementType` (`OPENING_STOCK` | `PURCHASE_RECEIPT` | `SALE` | `SALE_RETURN` | `PURCHASE_RETURN` | `DAMAGE` | `EXPIRY` | `MANUAL_ADJUSTMENT` | `STOCK_TRANSFER_IN` | `STOCK_TRANSFER_OUT`), `quantityChange`, `previousQuantity`, `newQuantity`, `referenceType`, `referenceId`, `reason`, `performedBy`, `timestamp`.
- **Rules:** Updates and deletes forbidden (`allow update, delete: if false`).

---

## 5. Phase 6: POS Billing, Payments, Returns & Idempotency Collections

### 5.1 `tenants/{tenantId}/sales_invoices/{invoiceId}`
Permanent immutable tax invoice snapshot conforming to Form 20B/21B and Indian GST invoicing.
- **Fields:** `id`, `invoiceNumber` (`INV-{BRANCH}-{YYYY}-{SEQ}`), `tenantId`, `branchId`, `userId`, `userName`, `customer` (`{ name, phone?, doctorName?, doctorRegNumber?, address?, gstin? }`), `items` (`InvoiceLineItem[]` storing `batchId`, `batchNumber`, `medicineId`, `medicineName`, `expiryDate`, `packSize`, `quantity`, `unitPrice`, `mrp`, `ptr`, `hsnCode`, `gstRate`, `discountPercent`, `discountAmount`, `lineTaxable`, `cgst`, `sgst`, `igst`, `lineTotal`, `returnedQuantity`), `subtotal`, `totalDiscount`, `taxableAmount`, `cgst`, `sgst`, `igst`, `roundOff`, `grandTotal`, `amountPaid`, `balanceDue`, `paymentStatus` (`paid` | `partial` | `unpaid`), `payments`, `status` (`completed` | `cancelled` | `partially_returned` | `returned`), `isInterState` (boolean), `notes`, `cancelledAt`, `cancelledBy`, `cancellationReason`, `createdAt`, `updatedAt`.
- **Composite Indexes (`firestore.indexes.json`):** `(branchId ASC, createdAt DESC)`, `(status ASC, createdAt DESC)`, `(paymentStatus ASC, createdAt DESC)`.

### 5.2 `tenants/{tenantId}/sales_invoices/{invoiceId}/payments/{paymentId}` (Immutable)
- **Fields:** `id`, `invoiceId`, `tenantId`, `branchId`, `mode` (`cash` | `upi` | `card` | `bank_transfer` | `khata_credit`), `amount`, `referenceNumber`, `recordedBy`, `timestamp`.

### 5.3 `tenants/{tenantId}/sales_invoices/{invoiceId}/returns/{returnId}` (Immutable)
- **Fields:** `id`, `invoiceId`, `invoiceNumber`, `tenantId`, `branchId`, `returnedByUserId`, `items` (`{ batchId, medicineId, medicineName, quantity, unitPrice, refundAmount, restocked }[]`), `totalRefundAmount`, `reason`, `createdAt`.

### 5.4 `tenants/{tenantId}/idempotency_keys/{key}`
- **Fields:** `key`, `tenantId`, `payloadHash` (SHA-256 of canonical request body), `status` (`pending` | `completed`), `result` (`InvoiceResult` snapshot), `completedAt`.
- **Guarantees:** Identical retries return cached response (`X-Cache: HIT`); mismatched payloads with same key return `422 IdempotencyConflictError`.

### 5.5 `tenants/{tenantId}/counters/{counterId}`
Atomic per-branch annual counter (`invoice_{branchId}_{year}`) incremented inside `runTransaction` for gap-free sequential `invoiceNumber` generation.

---

## 6. Governance & Upcoming Domain Collections (Phases 7–10)

All planned modules follow the same `/tenants/{tenantId}/...` Cloud Firestore isolation pattern:
- `tenants/{tenantId}/customers/{customerId}` — Patient directory, doctor links, credit limits, and live `khataBalance`.
- `tenants/{tenantId}/khata_ledger/{entryId}` — Immutable customer credit charges and settlement entries (Phase 7).
- `tenants/{tenantId}/suppliers/{supplierId}` — Distributor profiles, DL/GSTIN, payable balances (Phase 8).
- `tenants/{tenantId}/purchase_orders/{poId}` & `goods_receipts/{receiptId}` — Procurement and inward batch reception (Phase 8).
- `tenants/{tenantId}/expenses/{expenseId}`, `accounting_records/{entryId}`, & `reports/{reportId}` — Daily cash register reconciliation, P&L, GSTR-1, and Schedule H1 exports (Phase 9).
- `tenants/{tenantId}/subscriptions/{subscriptionId}` — SaaS plan lifecycle and billing status.
- `tenants/{tenantId}/audit_logs/{logId}` — Immutable security and statutory compliance audit logs (`allow update, delete: if false`).
