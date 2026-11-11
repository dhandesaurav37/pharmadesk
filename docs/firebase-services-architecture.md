# PharmaDesk Firebase Services & Managed Layer Architecture

**Document Version:** 2.0.0 (Hardened Security Specification)  
**Classification:** Cloud Services & Managed Infrastructure Architecture  
**Target Platform:** Firebase / Google Cloud Platform (`asia-south1` Mumbai)  
**Authoritative Core:** PostgreSQL 16 on Google Cloud SQL (Sole Authority for Business, Ledger & Access Control)

---

## 1. Executive Summary & Service Boundary Architecture

PharmaDesk incorporates Firebase as an **integrated managed services layer** to offload edge identity verification, client device attestation, mobile push notifications, client telemetry, operational real-time states, and object document storage.

### The Foundational Rule: PostgreSQL Authority
```
+--------------------------------------------------------------------------------------------------------+
|                                  PHARMADESK DATA BOUNDARY PRINCIPLE                                    |
+--------------------------------------------------------------------------------------------------------+
| 1. POSTGRESQL (CLOUD SQL) IS THE SOLE AND ABSOLUTE SOURCE OF TRUTH FOR:                                |
|    - Pharmacy business transactions (sales invoices, returns, credit notes).                           |
|    - Batch-level inventory counts, movements, and physical shelf stock.                                |
|    - All double-entry accounting journals, chart of accounts, and financial ledgers.                   |
|    - Customer Khata debt, credit limits, and patient profiles.                                         |
|    - Supplier profiles, purchase orders, goods receipts, and payables.                                 |
|    - Tenant legal entities, branches, staff memberships, and RBAC permissions.                        |
+--------------------------------------------------------------------------------------------------------+
                                                    |
                                                    v
+--------------------------------------------------------------------------------------------------------+
| 2. FIREBASE MANAGED SERVICES LAYER IS RESTRICTED EXCLUSIVELY TO:                                       |
|    - Identity Verification: Mobile phone SMS OTP, email/password credentials, and signed JWTs.         |
|    - Edge Client Attestation: Firebase App Check (reCAPTCHA Enterprise) against bots and scrapers.     |
|    - Real-Time Operational Signals: Cloud Firestore for active counter presence and draft locks.       |
|    - Document Object Storage: Firebase Storage for doctor prescriptions and distributor bills.         |
|    - Push Notifications: Firebase Cloud Messaging (FCM) for low-stock and near-expiry alerts.          |
|    - Anonymized Privacy-Compliant Telemetry: Firebase Analytics (zero PHI, zero drug names).           |
|    - Optional Frontend Delivery: Firebase Hosting with edge CDN and Cloud Run API rewrites.            |
+--------------------------------------------------------------------------------------------------------+
```

### Strict Architectural Prohibitions
1. **No Transactional Duplication:** Invoices, batch stock counts, customer ledger entries, and accounting records must **never** be copied or mirrored into Cloud Firestore.
2. **No Custom Claims as Authorization Authority:** Firebase Custom Claims must **never** be used as the authoritative source for pharmacy roles (`OWNER`, `PHARMACIST`, `CASHIER`, `HELPER`), branch assignments, or permissions. Authorization is evaluated server-side against PostgreSQL on every API request.
3. **No Direct Client Database Bypasses:** The React web client must never write directly to PostgreSQL or bypass backend business logic via client-side Firestore listeners.
4. **`request.auth != null` is NOT Tenant Authorization:** Neither Firestore nor Firebase Storage may permit read or write access based solely on authenticated identity (`request.auth != null`). A user authenticated with Firebase could belong to any pharmacy or no pharmacy at all.
5. **Client-Provided `tenantId` is NOT Authorization:** A client passing a `tenantId` in a path or payload has proved nothing about their right to access that tenant's records.

---

## 2. Service-by-Service Specifications

### 2.1 Service 1: Firebase Authentication (Identity Provider)
* **Role:** Managed **Identity Provider (IdP)**.
* **Supported Identity Vectors:**
  1. **Phone Number + SMS OTP:** Primary vector for Indian retail staff and owners.
  2. **Email + Secure Password:** Secondary vector for administrative owners and corporate chains.
* **Token Standard:**
  * Client receives an asymmetric RS256-signed JSON Web Token (`idToken`).
  * Token payload contains `uid` (Firebase UID), `phone_number`, `email`, and standard timestamps (`iat`, `exp`).
* **Mapping to PostgreSQL:**
  * When a user authenticates, their `firebase_uid` maps 1:1 to `users.firebase_uid` in PostgreSQL.
  * Tenant access is determined exclusively by querying `tenant_memberships` in PostgreSQL.

---

## 2.2 Service 2: Cloud Firestore (Operational Real-Time Tier)

Cloud Firestore is an **operational data service**, not merely a notification layer. It manages live counter states that change multiple times per minute without creating high-frequency transactional noise in PostgreSQL.

### Approved Firestore Operational Features:
1. **Live Workstation Presence:** Tracks which terminal/computer is active at Counter 1, Counter 2, or Backoffice.
2. **Real-Time Draft Cart Contention Locks:** Prevents two cashiers from opening the exact same customer telephone Khata draft simultaneously.
3. **Counter Status & Peripheral Health:** Real-time health signals (e.g. Counter 1 Thermal Printer online).
4. **In-Store Operational Broadcast Banners:** Ephemeral operational announcements dispatched by the store owner.

### Strictly Forbidden in Firestore:
- ❌ Issued sales invoices, totals, line items, or billing tax records.
- ❌ Batch inventory levels, purchase rates (PTR), or expiry dates.
- ❌ Customer Khata balances, ledger debits/credits.
- ❌ Supplier payables or distributor bills.
- ❌ Employee roles, permissions, passwords, or personal names.
- ❌ Patient health information, doctor prescriptions, or formulation salts.

### Privacy Safeguards in Firestore Operational Documents
To comply with the Digital Personal Data Protection (DPDP) Act 2023, Firestore documents must avoid storing unnecessary employee names or role strings:
```
/tenants/{tenantId}/branches/{branchId}
    /workstations/{workstationId}
        - workstationName: "Counter 1"
        - activeUserId: "usr_uuid_v4"       // Minimal identifier; no plain-text names or roles
        - lastHeartbeat: timestamp
        - status: "active" | "idle"
        
    /terminalLocks/{lockKey}
        - resourceType: "customer_khata" | "inventory_reconciliation"
        - resourceId: "res_uuid_v4"
        - lockedByUserId: "usr_uuid_v4"
        - lockedAt: timestamp
        - expiresAt: timestamp (TTL 5 minutes max)
```

### Hardened Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Default Deny
    match /{document=**} {
      allow read, write: if false;
    }
    
    // Validates that caller is authenticated AND belongs to the tenant
    // Tenant membership is verified via token custom claims populated by backend,
    // OR operational data is mediated via Express backend APIs.
    match /tenants/{tenantId}/branches/{branchId} {
      
      function isAuthorizedMember() {
        return request.auth != null 
          && request.auth.token.tenant_id == tenantId
          && (request.auth.token.branch_id == branchId || request.auth.token.is_all_branches == true);
      }
      
      // Workstations: Must belong to tenant and match active user UID
      match /workstations/{workstationId} {
        allow read: if isAuthorizedMember();
        allow write: if isAuthorizedMember()
          && request.resource.data.activeUserId == request.auth.uid
          && request.resource.data.lastHeartbeat == request.time;
      }
      
      // Terminal Locks: 5-minute TTL enforced
      match /terminalLocks/{lockKey} {
        allow read: if isAuthorizedMember();
        allow create: if isAuthorizedMember()
          && request.resource.data.lockedByUserId == request.auth.uid
          && request.resource.data.expiresAt <= request.time + duration.value(5, 'm');
        allow delete: if isAuthorizedMember()
          && (resource.data.lockedByUserId == request.auth.uid || resource.data.expiresAt < request.time);
      }
      
      // Live Operational Alerts: Read by authorized staff; written strictly by backend Admin SDK
      match /liveAlerts/{alertId} {
        allow read: if isAuthorizedMember();
        allow write: if false;
      }
    }
  }
}
```

---

## 2.3 Service 3: Firebase Storage (Unstructured File Storage)

Firebase Storage serves as the **managed object storage service** for prescription images and distributor purchase bills.

### Storage Responsibility & Scoping:
1. **Doctor Prescriptions:** Scanned patient slips or photos uploaded during Schedule H/H1 dispensing.
2. **Distributor Inward Invoices:** Scanned paper invoices from wholesale distributors.
3. **Store Branding Assets:** Pharmacy store logo for receipt printing headers.

### Bucket Structure:
```
gs://<bucket-name>/
  tenants/{tenantId}/
    branches/{branchId}/
      prescriptions/{documentId}.jpg
      inward_invoices/{documentId}.pdf
      store_logo.png
```

### Authoritative Reference in PostgreSQL:
The storage object path/URL is recorded in the authoritative PostgreSQL schema:
- `sales_invoices.prescription_doc_url`
- `goods_receipts.invoice_document_url`

### Storage Security Architecture:
1. **No Public Buckets:** All buckets have public access blocked.
2. **Backend-Mediated Access (Signed URLs):**
   - For uploading and viewing sensitive documents (prescriptions, supplier invoices), clients **must not** access Cloud Storage directly with raw client tokens.
   - The Express backend verifies tenant membership, branch assignment, and user permissions against PostgreSQL, then issues a time-limited (15-minute) cryptographic Signed URL (`getSignedUrl`) for the specific object.
3. **Storage Security Rules (Defense-in-Depth):**
   ```javascript
   rules_version = '2';
   service firebase.storage {
     match /b/{bucket}/o {
       // Deny all direct client access by default; all sensitive documents are mediated by backend
       match /{allPaths=**} {
         allow read, write: if false;
       }
       
       // Optional: Direct upload permitted only if tenant_id custom claim matches path
       match /tenants/{tenantId}/branches/{branchId}/{allPaths=**} {
         allow read, write: if request.auth != null 
           && request.auth.token.tenant_id == tenantId;
       }
     }
   }
   ```

---

## 2.4 Service 4: Firebase Cloud Messaging (FCM)
* **Role:** Push notifications for near-expiry batches, critical low-stock thresholds, and staff onboarding.
* **DPDP Act Compliance:** Zero patient names, prescription details, or drug salts in push payloads. Only generic actionable alerts.

---

## 2.5 Service 5: Firebase App Check
* **Role:** Edge attestation defending backend APIs against bots, unauthorized scrapers, and credential stuffing via reCAPTCHA Enterprise.

---

## 2.6 Service 6: Firebase Analytics
* **Role:** Operational telemetry and counter performance metrics.
* **Strict Privacy Rule:** Zero PHI, zero drug names, zero transaction amounts.

---

## 2.7 Service 7: Firebase Hosting
* **Role:** Static asset delivery via Google global CDN edge caches with `/api/**` rewrites to Cloud Run in `asia-south1`.

---

## 3. Security Boundary Summary Table

| Service | Primary Responsibility | Data Sensitivity | Authority Source | Access Control Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **PostgreSQL 16** | All business transactions, inventory, ledgers, RBAC | Highly Sensitive | **Sole Authority** | Kernel-level Row-Level Security (`app.current_tenant_id`) |
| **Firebase Auth** | Edge Identity (SMS OTP, Email/Password) | Identity Token | Auth Verification | RS256 token verification against Google public keys |
| **Cloud Firestore** | Real-time workstation presence, cart contention locks | Ephemeral Operational | Non-authoritative | Tenant-scoped rules + backend Admin SDK |
| **Firebase Storage** | Doctor prescription photos, distributor invoice PDFs | Medical PHI & Commercial | Non-authoritative | Backend-mediated time-limited Signed URLs |
| **FCM** | Mobile & desktop push alerts | Operational Notification | Non-authoritative | Backend Admin SDK dispatch; zero PHI in payloads |
| **App Check** | Client device & browser attestation | Security Attestation | Edge Protection | reCAPTCHA Enterprise token validation |
