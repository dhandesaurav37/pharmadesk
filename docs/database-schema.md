# PharmaDesk Cloud Firestore Data Schema & Isolation Model

**Document Version:** 6.0.0 (Standardized Cloud Firestore Architecture — Phase 9 Included)  
**Primary Database:** Cloud Firestore (Region: `asia-south1` Mumbai)  
**Isolation Model:** Tenant Subcollection Hierarchy (`/tenants/{tenantId}/...`) + Fail-Closed Security Rules + Live Server Authorization  
**Precision Standard:** Monetary values rounded to paise (`roundPaise`, 2 decimal places)  

---

## 1. Architectural Principles

Cloud Firestore is the **sole authoritative business database** for PharmaDesk.
- Every tenant-owned entity resides beneath `/tenants/{tenantId}/...`, making cross-tenant path traversal structurally impossible without explicit tenant authorization.
- Multi-document stock decrements, invoice numbering, and idempotency checks execute inside Firestore ACID `runTransaction` blocks.
- Security Rules (`firestore.rules`) deny all access by default (`allow read, write: if false`), block all direct client writes (`allow write: if false`) on authoritative business collections, and verify active tenant (`tenants/{tenantId}.status == 'active'`), active membership (`status == 'active'`), and explicit non-empty `assignedBranchIds` for non-owners.
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
- **Fields:** `tenantId`, `userId` (Firebase Auth UID), `name`, `email`, `phone`, `role` (`owner` | `pharmacist` | `cashier` | `helper` | `auditor`), `status` (`active` | `invited` | `deactivated` | `suspended`), `assignedBranchIds` (`string[]` — explicit non-empty branch IDs required for non-owners; `["*"]` reserved strictly for `owner`), `permissions` (`string[]`), `permissionOverrides` (`{ granted: string[], revoked: string[] }` — wildcard grants prohibited for non-owners), `invitedBy`, `statusUpdatedBy`, `createdAt`, `updatedAt`.

### 3.4 `tenants/{tenantId}/invitations/{invitationId}`
- **Fields:** `id`, `tenantId`, `email`, `name`, `phone`, `role`, `assignedBranchIds`, `permissionOverrides`, `token` (cryptographic random string), `status` (`pending` | `accepted` | `expired` | `cancelled` | `revoked`), `expiresAt` (72-hour TTL), `createdAt`, `createdBy`, `acceptedByUserId`, `acceptedAt`.

---

## 4. Medicine Formulary & Batch Inventory Collections

### 4.1 `tenants/{tenantId}/medicines/{medicineId}`
- **Fields:** `id`, `tenantId`, `name` (brand/trade name), `genericName` (salt formulation), `brand` (manufacturer), `category`, `dosageForm`, `strength`, `packSize`, `uom`, `hsnCode`, `gstRate` (`0 | 5 | 12 | 18 | 28`), `barcode`, `prescriptionRequired` (boolean), `schedule` (`OTC` | `H` | `H1` | `X`), `minStockThreshold` (number), `description`, `status` (`active` | `inactive` | `archived`), `createdBy`, `createdAt`, `updatedAt`.

### 4.2 `tenants/{tenantId}/inventory_batches/{batchId}`
- **Fields:** `id`, `tenantId`, `branchId`, `medicineId`, `medicineName`, `genericName`, `batchNumber`, `manufacturingDate`, `expiryDate` (`YYYY-MM` or `YYYY-MM-DD`), `purchasePrice` (PTR), `mrp`, `sellingPrice`, `quantityReceived`, `currentStock` (strictly `>= 0`), `freeQuantity`, `supplierId`, `supplierName`, `rackLocation`, `barcode`, `status` (`normal` | `low_stock` | `near_expiry` | `expired` | `out_of_stock`), `createdAt`, `updatedAt`.
- **Composite Indexes (`firestore.indexes.json`):** `(branchId ASC, status ASC, expiryDate ASC)`, `(branchId ASC, medicineId ASC, expiryDate ASC)`, `(medicineId ASC, expiryDate ASC)`.

### 4.3 `tenants/{tenantId}/stock_movements/{movementId}` (Immutable Append-Only)
- **Fields:** `id`, `tenantId`, `branchId`, `medicineId`, `batchId`, `batchNumber`, `medicineName`, `movementType` (`OPENING_STOCK` | `PURCHASE_RECEIPT` | `SALE` | `SALE_RETURN` | `INVOICE_CANCEL_REVERSAL` | `PURCHASE_RETURN` | `DAMAGE` | `EXPIRY` | `MANUAL_ADJUSTMENT` | `STOCK_TRANSFER_IN` | `STOCK_TRANSFER_OUT`), `quantityChange`, `previousQuantity`, `newQuantity`, `referenceType`, `referenceId`, `reason`, `performedBy`, `timestamp`.
- **Rules:** All direct client writes forbidden (`allow write: if false`; written exclusively via Admin SDK transactions).

---

## 5. Phase 6: POS Billing, Payments, Returns & Idempotency Collections

### 5.1 `tenants/{tenantId}/sales_invoices/{invoiceId}`
Permanent immutable tax invoice snapshot conforming to Form 20B/21B and Indian GST invoicing.
- **Fields:** `id`, `invoiceNumber` (`INV-{BRANCH}-{YYYY}-{SEQ}`), `tenantId`, `branchId`, `userId`, `userName`, `customerId` (optional link to `tenants/{tenantId}/customers/{customerId}`), `customer` (`{ name, phone?, doctorName?, doctorRegNumber?, address?, gstin? }`), `items` (`InvoiceLineItem[]` storing `batchId`, `batchNumber`, `medicineId`, `medicineName`, `expiryDate`, `packSize`, `quantity`, `unitPrice`, `mrp`, `ptr`, `hsnCode`, `gstRate`, `discountPercent`, `discountAmount`, `lineTaxable`, `cgst`, `sgst`, `igst`, `lineTotal`, `returnedQuantity`), `subtotal`, `totalDiscount`, `taxableAmount`, `cgst`, `sgst`, `igst`, `roundOff`, `grandTotal`, `amountPaid`, `khataCreditAmount` (optional INR financed on Khata), `balanceDue`, `creditTermsDays` (`0 | 7 | 15 | 30`), `dueDate` (ISO timestamp), `paymentStatus` (`paid` | `partial` | `unpaid`), `payments`, `status` (`completed` | `cancelled` | `partially_returned` | `returned`), `totalRefunded`, `refundStatus` (`not_applicable` | `refund_pending` | `refunded`), `refundAmount`, `isInterState` (boolean), `notes`, `cancelledAt`, `cancelledBy`, `cancellationReason`, `createdAt`, `updatedAt`.
- **Composite Indexes (`firestore.indexes.json`):** `(branchId ASC, createdAt DESC)`, `(branchId ASC, status ASC, createdAt DESC)`, `(status ASC, createdAt DESC)`, `(paymentStatus ASC, createdAt DESC)`, `(customerId ASC, createdAt DESC)`, `(branchId ASC, paymentStatus ASC, dueDate ASC)`.

### 5.2 `tenants/{tenantId}/sales_invoices/{invoiceId}/payments/{paymentId}` (Immutable)
- **Fields:** `id`, `invoiceId`, `tenantId`, `branchId`, `mode` (`cash` | `upi` | `card` | `bank_transfer` | `khata_credit`), `amount`, `referenceNumber`, `recordedBy`, `timestamp`.

### 5.3 `tenants/{tenantId}/sales_invoices/{invoiceId}/returns/{returnId}` (Immutable)
- **Fields:** `id`, `invoiceId`, `invoiceNumber`, `tenantId`, `branchId`, `returnedByUserId`, `items` (`{ batchId, medicineId, medicineName, quantity, unitPrice, refundAmount, restocked, nonRestockReason? }[]`), `totalRefundAmount`, `reason`, `createdAt`.

### 5.4 `tenants/{tenantId}/idempotency_keys/{key}` (Server-Only)
- **Fields:** `key`, `tenantId`, `branchId`, `operation` (`checkout` | `payment` | `return` | `cancel`), `payloadHash` (SHA-256 of canonical request body + branchId), `status` (`pending` | `completed`), `result` (cached endpoint result snapshot), `createdAt`, `completedAt`.
- **Rules & Guarantees:** Client reads and writes denied (`allow read, write: if false`). Identical retries return cached response (`X-Cache: HIT`); mismatched payloads or branches with same key return `409 Conflict` (`IdempotencyConflictError`).

### 5.5 `tenants/{tenantId}/counters/{counterId}` (Server-Only)
- **Rules & Behavior:** Client reads and writes denied (`allow read, write: if false`). Atomic per-branch annual counter (`invoice_{branchId}_{year}`) incremented inside the same `runTransaction` as invoice persistence for gap-free sequential `invoiceNumber` generation.

---

## 6. Phase 7: Customer Directory & Khata Credit Ledger Collections

### 6.1 `tenants/{tenantId}/customers/{customerId}`
- **Fields:** `id`, `tenantId`, `primaryBranchId`, `name`, `phone`, `normalizedPhone` (E.164 `+91XXXXXXXXXX`), `alternatePhone`, `email`, `customerType` (`REGULAR` | `VIP` | `CHRONIC` | `CORPORATE` | `CLINIC` | `SENIOR_CITIZEN`), `address`, `city`, `state`, `pincode`, `dateOfBirth`, `gender`, `preferredDoctorName`, `allergies`, `chronicConditions`, `gstin`, `creditEnabled` (boolean), `creditLimit` (INR), `creditTermsDays` (`0 | 7 | 15 | 30`), `currentOutstandingBalance` (INR `>= 0`), `advanceBalance` (INR `>= 0`), `totalPurchases`, `totalPayments`, `totalVisits`, `lastPurchaseDate`, `lastPaymentDate`, `status` (`ACTIVE` | `INACTIVE` | `BLOCKED`), `isArchived` (boolean), `archivedAt`, `archivedBy`, `sharedPhoneConfirmed` (boolean), `notes`, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`.
- **Composite Indexes (`firestore.indexes.json`):** `(normalizedPhone ASC, isArchived ASC)`, `(isArchived ASC, currentOutstandingBalance DESC)`, `(isArchived ASC, status ASC, name ASC)`.

### 6.2 `tenants/{tenantId}/customers/{customerId}/ledger/{entryId}` (Immutable Append-Only)
- **Fields:** `id`, `tenantId`, `branchId`, `customerId`, `entryType` (`CREDIT_PURCHASE` | `CASH_PAYMENT` | `UPI_PAYMENT` | `CARD_PAYMENT` | `BANK_TRANSFER` | `CREDIT_NOTE` | `DEBIT_ADJUSTMENT` | `CREDIT_ADJUSTMENT` | `OPENING_BALANCE` | `REFUND`), `direction` (`DEBIT` | `CREDIT`), `amount`, `appliedToBalance`, `advanceDelta`, `previousBalance`, `runningBalance`, `previousAdvanceBalance`, `runningAdvanceBalance`, `referenceType`, `referenceId`, `invoiceId`, `invoiceNumber`, `paymentId`, `returnId`, `paymentMode`, `referenceNumber`, `description`, `reason`, `operationRef`, `performedBy`, `performedByName`, `timestamp`.
- **Rules & Invariants:** `allow read` gated by `customers.khata_view`; `allow write: if false` (Admin SDK transactions only). Integer paise arithmetic guarantees exact reconciliation: `opening + debits - credits === currentOutstandingBalance - advanceBalance`.

### 6.3 `tenants/{tenantId}/customers/{customerId}/payments/{paymentId}` (Immutable Append-Only)
- **Fields:** `id`, `tenantId`, `branchId`, `customerId`, `receiptNumber` (`RCP-{YYYY}-{SEQ}`), `amount`, `paymentMode` (`cash` | `upi` | `card` | `bank_transfer`), `referenceNumber`, `paymentDate`, `appliedAmount`, `advanceAmount`, `allocations` (`{ invoiceId, invoiceNumber, allocatedAmount, previousDue, remainingDue }[]`), `allowAdvance`, `notes`, `collectedBy`, `createdAt`.
- **Rules:** `allow read` gated by `customers.khata_view`; `allow write: if false`.
- **Idempotency Extensions:** `tenants/{tenantId}/idempotency_keys/{key}` also supports operations `khata_payment`, `khata_credit_note`, and `khata_adjustment`.

---

## 7. Phase 8: Suppliers, Purchase Orders, Goods Receipts & Accounts Payable Collections

### 7.1 `tenants/{tenantId}/suppliers/{supplierId}`
- **Fields:** `id`, `supplierId`, `tenantId`, `supplierCode` (`SUP-{NNNN}`), `legalName`, `tradeName`, `contactPerson`, `primaryPhone`, `normalizedPhone` (`+91XXXXXXXXXX`), `alternatePhone`, `email`, `gstin`, `gstinFormatValid`, `gstinVerificationNote`, `pan`, `billingAddress`, `shippingAddress`, `state`, `stateCode` (`27`, `29`, etc.), `pincode`, `drugLicenceNumber`, `supplierType` (`DISTRIBUTOR` | `MANUFACTURER` | `C_AND_F` | `WHOLESALER` | `SURGICAL_VENDOR` | `GENERIC_STOCKIST`), `paymentTerms`, `creditPeriodDays`, `creditLimit`, `openingBalance`, `currentOutstandingBalance`, `advanceBalance`, `totalPurchases`, `totalPayments`, `lastPurchaseDate`, `lastPaymentDate`, `bankDetails` (redacted when caller lacks `suppliers.view_bank_details`), `attachments`, `notes`, `status` (`ACTIVE` | `INACTIVE` | `BLOCKED`), `isArchived`, `archivedAt`, `archivedBy`, `blockReason`, `duplicateConfirmed`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Composite Indexes (`firestore.indexes.json`):** `(status ASC, tradeName ASC)`, `(isArchived ASC, currentOutstandingBalance DESC)`.

### 7.2 `tenants/{tenantId}/purchaseOrders/{purchaseOrderId}` (Non-Accounting Commitment)
- **Fields:** `id`, `poId`, `poNumber` (`PO-{YYYY}-{SEQ}`), `tenantId`, `branchId`, `supplierId`, `supplierCode`, `supplierName`, `supplierGstin`, `supplierStateCode`, `tenantStateCode`, `placeOfSupplyStateCode`, `isInterState`, `orderDate`, `expectedDeliveryDate`, `status` (`DRAFT` | `PENDING_APPROVAL` | `APPROVED` | `PARTIALLY_RECEIVED` | `FULLY_RECEIVED` | `CLOSED` | `CANCELLED`), `items` (`PurchaseOrderLineItem[]`), `subtotal`, `totalDiscount`, `invoiceDiscount`, `otherCharges`, `taxableAmount`, `cgst`, `sgst`, `igst`, `totalTax`, `roundOff`, `grandTotal`, `totalOrderedQty`, `totalReceivedQty`, `totalPendingQty`, `paymentTerms`, `notes`, approval/cancellation/closure metadata, `createdAt`, `updatedAt`.
- **Rules & Indexes:** Branch-scoped reads (`purchase_orders.view` + `hasBranchAccess`); `allow write: if false;` (Admin SDK only). Composite indexes: `(branchId ASC, status ASC, orderDate DESC)`, `(supplierId ASC, orderDate DESC)`.

### 7.3 `tenants/{tenantId}/goodsReceipts/{grnId}`
- **Fields:** `id`, `grnId`, `grnNumber` (`GRN-{YYYY}-{SEQ}`), `tenantId`, `branchId`, `poId`, `poNumber`, `supplierId`, `supplierCode`, `supplierName`, `supplierInvoiceNumber`, `supplierInvoiceDate`, `receiptDate`, `receivedAt`, `placeOfSupplyStateCode`, `isInterState`, `status` (`POSTED` | `REVERSED`), `items` (`GrnBatchLine[]` linking `inventoryBatchId`), `warnings` (short-expiry alerts), `subtotal`, `totalDiscount`, `invoiceDiscount`, `otherCharges`, `taxableAmount`, `cgst`, `sgst`, `igst`, `totalTax`, `roundOff`, `grandTotal`, `linkedInvoiceId`, `reversedAt`, `reversedBy`, `reversalReason`, `idempotencyKey`, `operationId`, `createdBy`, `createdAt`, `updatedAt`.
- **Composite Indexes (`firestore.indexes.json`):** `(branchId ASC, receivedAt DESC)`, `(supplierId ASC, receivedAt DESC)`.

### 7.4 `tenants/{tenantId}/supplierInvoices/{invoiceId}` (Single-Liability Payable)
- **Fields:** `id`, `invoiceId`, `tenantId`, `branchId`, `supplierId`, `supplierCode`, `supplierName`, `supplierInvoiceNumber`, `grnId`, `grnNumber`, `poId`, `poNumber`, `invoiceDate`, `dueDate`, `placeOfSupplyStateCode`, `isInterState`, `subtotal`, `totalDiscount`, `otherCharges`, `taxableAmount`, `cgst`, `sgst`, `igst`, `totalTax`, `roundOff`, `totalAmount`, `amountPaid`, `creditNoteAmount`, `outstandingAmount`, `paymentStatus` (`UNPAID` | `PARTIALLY_PAID` | `PAID` | `OVERDUE` | `REVERSED`), `recognitionBasis` (`GRN` | `DIRECT_BILL`), `attachmentPath`, `notes`, `reversedAt`, `reversalReason`, `createdBy`, `createdAt`, `updatedAt`.
- **Composite Indexes:** `(paymentStatus ASC, dueDate ASC)`, `(supplierId ASC, invoiceDate DESC)`.

### 7.5 `tenants/{tenantId}/supplierPayments/{paymentId}`
- **Fields:** `id`, `paymentId`, `paymentNumber` (`SPAY-{YYYY}-{SEQ}`), `tenantId`, `branchId`, `supplierId`, `supplierCode`, `supplierName`, `paymentDate`, `paymentMode` (`CASH` | `UPI` | `CARD` | `BANK_TRANSFER` | `NEFT_RTGS` | `CHEQUE` | `ADVANCE_ADJUSTMENT`), `amount`, `allocatedTotal`, `advanceAdded`, `referenceNumber`, `notes`, `allocations` (`{ invoiceId, supplierInvoiceNumber, allocatedAmount }[]`), `idempotencyKey`, `operationId`, `createdBy`, `createdAt`.
- **Composite Index:** `(supplierId ASC, paymentDate DESC)`.

### 7.6 `tenants/{tenantId}/supplierReturns/{returnId}`
- **Fields:** `id`, `returnId`, `returnNumber` (`SRET-{YYYY}-{SEQ}`), `tenantId`, `branchId`, `supplierId`, `supplierCode`, `supplierName`, `grnId`, `grnNumber`, `linkedInvoiceId`, `creditNoteNumber`, `returnDate`, `status` (`POSTED` | `PENDING_APPROVAL`), `items` (`SupplierReturnItem[]`), `subtotal`, `totalTax`, `totalAmount`, `payableReduced`, `advanceCredited`, `reason`, `approvedBy`, `approvedAt`, `idempotencyKey`, `operationId`, `createdBy`, `createdAt`.
- **Composite Indexes:** `(supplierId ASC, createdAt DESC)`, `(branchId ASC, createdAt DESC)`.

### 7.7 `tenants/{tenantId}/purchaseOperations/{operationId}` (Server-Only State Machine)
- **Fields:** `id`, `tenantId`, `branchId`, `operationType` (`CREATE_PO` | `APPROVE_PO` | `POST_GRN` | `REVERSE_GRN` | `CREATE_SUPPLIER_INVOICE` | `RECORD_SUPPLIER_PAYMENT` | `CREATE_SUPPLIER_RETURN`), `targetId`, `idempotencyKey`, `status` (`STARTED` | `COMMITTED` | `FAILED` | `REVERSED`), `performedBy`, `errorMessage`, `startedAt`, `completedAt`.
- **Rules:** Internal Admin SDK state only (`allow read, write: if false`).

---

## 8. Phase 9: Double-Entry Accounting, Financial Periods & Expenses Collections

All accounting records live under `/tenants/{tenantId}/...`, compute strictly in integer paise (`debitPaise`, `creditPaise`), prohibit client writes (`allow write: if false`), and link directly to operational references (`sales_invoice`, `khata_payment`, `grn`, `supplier_invoice`, `supplier_payment`, `supplier_return`, `expense`, `internal_transfer`, `bank_charge`, `opening_balance`) without duplicating customer or supplier subledgers:
- `tenants/{tenantId}/accounts/{accountId}`: Chart of Accounts (`code`, `name`, `category`, `subType`, `normalBalance`, `isSystemAccount`, `systemCode`, `isActive`).
- `tenants/{tenantId}/journalEntries/{entryId}` (Immutable Append-Only): Balanced vouchers (`voucherNumber`, `entryType`, `status`, `transactionDate`, `branchId`, `periodId`, `referenceType`, `referenceId`, `debitTotalPaise === creditTotalPaise`, `lines[]`, `reversesEntryId`, `reversedByEntryId`, `idempotencyKey`). Composite indexes: `(branchId ASC, transactionDate DESC)`, `(entryType ASC, transactionDate DESC)`, `(status ASC, transactionDate DESC)`.
- `tenants/{tenantId}/journalLines/{lineId}` (Immutable Flat Line Index): Normalized debit/credit lines for fast account-ledger and branch P&L queries (`accountId`, `accountCode`, `branchId`, `transactionDate`, `debitPaise`, `creditPaise`). Composite index: `(accountId ASC, transactionDate ASC)`.
- `tenants/{tenantId}/financialPeriods/{periodId}`: Indian Financial Year Apr–Mar periods (`financialYear`, `periodNumber`, `startDate`, `endDate`, `status`: `OPEN` | `CLOSED`, closing/reopen audit metadata).
- `tenants/{tenantId}/cashAccounts/{cashAccountId}` & `tenants/{tenantId}/bankAccounts/{bankAccountId}`: Branch-linked cash registers (`1100`/`1110`) and store bank accounts (`1200`/`1201+`) storing masked account numbers and IFSC metadata.
- `tenants/{tenantId}/bankReconciliations/{reconciliationId}`: Manually imported CSV/JSON bank statement headers & line-level journal voucher match status (`OPEN` | `MATCHED`).
- `tenants/{tenantId}/expenses/{expenseId}`: Operating expenses (`SUBMITTED` | `APPROVED_UNPAID` | `PARTIALLY_PAID` | `PAID` | `REVERSED`) with CGST/SGST/IGST ITC eligibility flags and linked GL voucher IDs (`recognitionJournalId`, `paymentJournalId`, `reversalJournalId`). Composite indexes: `(branchId ASC, expenseDate DESC)`, `(status ASC, expenseDate DESC)`.
- `tenants/{tenantId}/accountingOperations/{operationId}` (Server-Only): Admin SDK idempotency & posting deduplication state (`allow read, write: if false`).

---

## 9. Governance & Upcoming Domain Collections (Phase 10+)

- `tenants/{tenantId}/stock_transfers/{transferId}` — Two-phase inter-branch inventory transfers (Planned Phase 10).
- `tenants/{tenantId}/subscriptions/{subscriptionId}` — SaaS plan lifecycle and billing status.
- `tenants/{tenantId}/audit_logs/{logId}` — Immutable security and statutory compliance audit logs (`allow update, delete: if false`).
