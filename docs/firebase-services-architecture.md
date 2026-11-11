# PharmaDesk Firebase-First Services & Cloud Firestore Architecture

**Document Version:** 3.0.0 (Phase 3 Firebase-First Production Architecture)  
**Classification:** Cloud Services, Primary Database & Managed Infrastructure Architecture  
**Target Platform:** Firebase / Google Cloud Platform (`asia-south1` Mumbai)  
**Primary Database:** Cloud Firestore (Sole Authority for Business Records, Inventory, Invoices & Access Control)  
**Authentication & Storage:** Firebase Authentication & Firebase Storage  

---

## 1. Executive Summary & Approved Architecture

PharmaDesk is built on a **Firebase-First Cloud Architecture** running on Google Cloud Run in `asia-south1` (Mumbai). 

### Approved Architectural Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4.
- **Backend API:** Node.js + Express + TypeScript on Google Cloud Run.
- **Primary Database:** Cloud Firestore (Enterprise document store with ACID multi-document transactions).
- **Authentication:** Firebase Authentication (Phone OTP, Email/Password, RS256 ID tokens).
- **File Storage:** Firebase Storage (Prescriptions, supplier invoices, attachments with signed v4 URLs).
- **Security & Attestation:** Firebase App Check, Firestore Security Rules, and Express tenant-level authorization middleware.
- **Push Notifications:** Firebase Cloud Messaging (FCM).

---

## 2. Cloud Firestore Data Architecture & Multi-Tenant Isolation

Every pharmacy business record is stored in Cloud Firestore under strict tenant-isolated collection hierarchies.

```
/tenants/{tenantId}                               [Pharmacy profile, DL 20B/21B, GSTIN, Owner UID]
    /branches/{branchId}                          [Counter and branch details]
    /memberships/{userId}                         [RBAC roles, active status, branch assignments]
    /invitations/{invitationId}                   [Staff invitations]
    /medicines/{medicineId}                       [Medicine catalog, salt formulation, HSN]
    /inventory_batches/{batchId}                  [Batch number, expiry, MRP, currentStock]
    /stock_movements/{movementId}                 [Immutable append-only stock audit ledger]
    /sales_invoices/{invoiceId}                   [GST invoices, customer details, tax breakdown]
    /idempotency_keys/{key}                       [Deduplication and transaction safety]
    /customers/{customerId}                       [Customer directory and Khata balances]
    /suppliers/{supplierId}                       [Distributor profiles and payables]
    /audit_logs/{logId}                           [Security audit logs]

/users/{userId}                                   [Global user registry mapped to Firebase Auth UID]
```

### Strict Rules of Engagement
1. **Single Source of Truth:** Cloud Firestore is the sole database for all business and financial records.
2. **Atomic Inventory Transactions:** Medicine dispensing is executed exclusively via Firestore `runTransaction` with automatic check for `currentStock >= quantity` and atomic stock decrements.
3. **Immutable Audit Trails:** `stock_movements` and `audit_logs` are append-only. Updates and deletions are blocked by security rules and backend validation.
4. **Live Membership Verification:** User roles and permissions are always validated against the live Firestore document `tenants/{tenantId}/memberships/{userId}` on every request. Deactivated accounts are blocked immediately.
5. **No LocalStorage Business Data:** Business records, financial data, and customer info are never stored in client `localStorage`.

---

## 3. Service Boundaries

| Service | Responsibility | Authority | Security Mechanism |
| :--- | :--- | :--- | :--- |
| **Cloud Firestore** | Primary transactional database, inventory, sales, memberships | **Sole Authority** | Tenant-isolated subcollections, Firestore Security Rules, atomic transactions |
| **Firebase Auth** | Identity provider (SMS OTP, Email/Password) | Identity Provider | RS256 token verification via Firebase Admin SDK |
| **Firebase Storage** | Prescriptions and supplier invoices | File Storage | Tenant-isolated paths, signed v4 URLs with 15-minute TTL |
| **Firebase App Check** | Client integrity attestation | Edge Security | reCAPTCHA Enterprise verification |
| **Firebase Cloud Messaging**| Operational alerts (low-stock, near-expiry) | Push Gateway | Admin SDK dispatch; zero PHI in payloads |

---

## 4. Concurrency & Idempotency Safeguards

To prevent double billing or race conditions during peak hours at retail counters:
- **Idempotency Keys:** Every billing request must supply an idempotency key. Completed invoices are stored in `tenants/{tenantId}/idempotency_keys/{key}` and returned idempotently on client retry.
- **ACID Transactions:** Firestore `runTransaction` guarantees serializability for concurrent sales on the same medicine batch, throwing `InsufficientStockError` if stock is exhausted.
