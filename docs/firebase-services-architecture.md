# PharmaDesk Firebase Services & Managed Layer Architecture

**Document Version:** 1.0.0 (Production Specification)  
**Classification:** Cloud Services & Managed Infrastructure Architecture  
**Target Platform:** Firebase / Google Cloud Platform (`asia-south1` Mumbai)  
**Authoritative Core:** PostgreSQL 16 on Google Cloud SQL (Sole Authority for Business & Financial Records)

---

## 1. Executive Summary & Service Boundary Architecture

PharmaDesk incorporates Firebase as an **integrated managed services layer** to offload edge identity verification, client device attestation, mobile push notifications, client telemetry, and real-time operational collaboration. 

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
|    - Real-Time Operational Signals: Cloud Firestore for active counter presence and draft locks only.  |
|    - Push Notifications: Firebase Cloud Messaging (FCM) for low-stock and near-expiry alerts.          |
|    - Anonymized Privacy-Compliant Telemetry: Firebase Analytics (zero PHI, zero drug names).           |
|    - Optional Frontend Delivery: Firebase Hosting with edge CDN and Cloud Run API rewrites.            |
+--------------------------------------------------------------------------------------------------------+
```

### Strict Architectural Prohibitions
1. **No Transactional Duplication:** Invoices, batch stock counts, customer ledger entries, and accounting records must **never** be copied or mirrored into Cloud Firestore.
2. **No Custom Claims as Authorization Authority:** Firebase Custom Claims must **never** be used as the authoritative source for pharmacy roles (`OWNER`, `PHARMACIST`, `CASHIER`, `HELPER`), branch assignments, or permissions. Authorization is evaluated server-side against PostgreSQL on every API request.
3. **No Direct Client Database Bypasses:** The React web client must never write directly to PostgreSQL or bypass backend business logic via client-side Firestore listeners.

---

## 2. Service-by-Service Specifications

### 2.1 Service 1: Firebase Authentication (Identity Provider)
* **Role:** Acts as the managed **Identity Provider (IdP)**.
* **Supported Identity Vectors:**
  1. **Phone Number + SMS OTP:** Primary vector for Indian retail staff and owners (supported via Firebase Phone Auth with 6-digit OTP).
  2. **Email + Secure Password:** Secondary vector for administrative owners and enterprise pharmacy chains.
* **Token Standard:**
  * Client receives an asymmetric RS256-signed JSON Web Token (`idToken`).
  * Token payload contains `uid` (Firebase UID), `phone_number`, `email`, and standard timestamps (`iat`, `exp`).
  * Tokens expire after 60 minutes and are rotated automatically by the client SDK.
* **Mapping to PostgreSQL:**
  * When a user authenticates, their `firebase_uid` maps 1:1 to `users.firebase_uid` in PostgreSQL.
  * Tenant access is determined by querying `tenant_memberships` in PostgreSQL, allowing one Firebase user to belong to multiple independent pharmacy accounts.

---

### 2.2 Service 2: Firebase Admin SDK (Backend Verification Engine)
* **Role:** Server-side verification and administration within the Express modular monolith on Cloud Run.
* **Initialization Architecture:**
  * The Express backend initializes Firebase Admin SDK once during container startup using service account credentials injected via Google Cloud Secret Manager.
  * In Google Cloud Run with Workload Identity or attached Service Accounts, default application credentials (`google-auth-library`) are preferred, eliminating plain-text JSON keyfiles.
* **Verification Flow:**
  ```typescript
  import admin from 'firebase-admin';

  export async function verifyFirebaseToken(rawToken: string): Promise<string> {
    // Verifies cryptographic signature, issuer, and expiration locally using cached Google public keys:
    const decodedToken = await admin.auth().verifyIdToken(rawToken, true);
    return decodedToken.uid;
  }
  ```
* **Session Invalidation Handling:**
  * When an employee is revoked by a pharmacy owner, the Express backend calls `admin.auth().revokeRefreshTokens(uid)` to force token revocation at the Identity tier, while simultaneously marking `tenant_memberships.status = 'deactivated'` in PostgreSQL for sub-millisecond local enforcement.

---

### 2.3 Service 3: Cloud Firestore (Real-Time Non-Financial Operational Data)
* **Approved Use Cases:**
  1. **Live Counter Workstation Presence:** Indicating which cashier/computer is actively logged into "Billing Counter 1", "Billing Counter 2", or "Store Backoffice".
  2. **Active Draft Cart Terminal Locks:** Preventing two cashiers from opening the exact same customer telephone Khata draft simultaneously.
  3. **Live Operational Broadcast Banners:** Instant in-store notifications dispatched by the store owner (e.g. "Distributor delivery arrived at back door", "Shift handover starting").
  4. **Thermal Printer Station Status:** Status of local receipt printing clients (e.g. "Counter 1 Thermal Printer: Online / Paper OK").
* **Explicitly Forbidden in Firestore:**
  - ❌ Sales invoices, totals, line items, or billing sequences.
  - ❌ Current stock levels, batch numbers, or expiry dates.
  - ❌ Customer Khata balances, ledger debits/credits.
  - ❌ Supplier payables or distributor invoices.
  - ❌ Employee roles, permissions, or passwords.
  - ❌ Patient health information, doctor prescriptions, or drug salts.

#### Firestore Document Schema
```
/tenants/{tenantId}
    /branches/{branchId}
        /workstations/{workstationId}
            - name: "Counter 1 (Main POS)"
            - activeUserId: "uuid-v4"
            - activeUserName: "Pooja Deshmukh"
            - role: "cashier"
            - lastHeartbeat: timestamp
            - status: "active" | "idle"
            
        /terminalLocks/{lockKey}
            - resourceType: "customer_khata" | "inventory_reconciliation"
            - resourceId: "uuid-v4"
            - lockedByWorkstation: "Counter 1"
            - lockedByUserId: "uuid-v4"
            - lockedAt: timestamp
            - expiresAt: timestamp (TTL 5 minutes)
            
        /liveAlerts/{alertId}
            - type: "info" | "warning"
            - title: "Stockist Delivery"
            - message: "Apex Distributors delivery ready for inspection"
            - createdAt: timestamp
            - expiresAt: timestamp
```

#### Security Rules (`firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to verify caller is authenticated:
    function isAuthenticated() {
      return request.auth != null;
    }
    
    // Deny access by default to everything:
    match /{document=**} {
      allow read, write: if false;
    }
    
    // Scoped access to branch real-time operational status:
    match /tenants/{tenantId}/branches/{branchId} {
      
      // Workstations: Authenticated staff can read; write only with valid heartbeat payload:
      match /workstations/{workstationId} {
        allow read: if isAuthenticated();
        allow write: if isAuthenticated() 
          && request.resource.data.activeUserId == request.auth.uid
          && request.resource.data.lastHeartbeat == request.time;
      }
      
      // Terminal Locks: Enforce 5-minute maximum TTL to prevent permanent stale locks:
      match /terminalLocks/{lockKey} {
        allow read: if isAuthenticated();
        allow create: if isAuthenticated() 
          && request.resource.data.lockedByUserId == request.auth.uid
          && request.resource.data.expiresAt <= request.time + duration.value(5, 'm');
        allow delete: if isAuthenticated() 
          && (resource.data.lockedByUserId == request.auth.uid || resource.data.expiresAt < request.time);
      }
      
      // Live Operational Alerts: Read by authenticated staff; created only by backend Admin SDK:
      match /liveAlerts/{alertId} {
        allow read: if isAuthenticated();
        allow write: if false; // Only backend Express API writes alerts using Admin SDK
      }
    }
  }
}
```

---

### 2.4 Service 4: Firebase Cloud Messaging (FCM — Push Notifications)
* **Role:** Asynchronous notification delivery to pharmacy staff mobile devices and counter desktop browsers.
* **Notification Scenarios:**
  1. **Near-Expiry Alerts:** Nightly summary alerting the owner and pharmacist of batches expiring within the configured threshold (e.g. 30/60 days).
  2. **Critical Low Stock Thresholds:** Alerts when essential formulations fall below minimum reorder points.
  3. **High-Value Khata Debt Settle Notifications:** Confirmation when a customer settles significant overdue credit.
  4. **Staff Invitation & Onboarding:** Links sent to invited employees to complete registration.
* **Device Token Lifecycle:**
  * When an employee logs in, the client registers the browser or device FCM token via `POST /api/v1/notifications/register-token`.
  * Tokens are stored in PostgreSQL table `user_device_tokens(tenant_id, user_id, fcm_token, device_type, updated_at)`.
* **Privacy & DPDP Compliance Safeguards:**
  * **Zero PHI in Push Payloads:** Push notification payloads must **never** contain patient names, prescription details, or specific pharmaceutical formulation salts.
  * **Safe Format Example:**
    * ❌ Bad: *"Patient Rahul Sharma purchased 50 tablets of Paracetamol 650mg on credit."*
    * ✅ Compliant: *"Counter 1: New Khata credit transaction recorded. Tap to view ledger."*

---

### 2.5 Service 5: Firebase App Check (Edge Client Attestation)
* **Role:** Defends PharmaDesk backend APIs against automated bot traffic, unauthorized scrapers, credential stuffing, and malicious script executions.
* **Attestation Providers:**
  * **Web Application:** **reCAPTCHA Enterprise** (or reCAPTCHA v3) verifying genuine human interaction in retail counter browsers.
  * **Mobile / Tablet Applications (Future):** **Play Integrity API** on Android; **DeviceCheck / App Attest** on iOS.
* **Backend Enforcement:**
  * All incoming mutating API calls (`POST`, `PUT`, `DELETE`) pass through the App Check verification middleware:
  ```typescript
  import admin from 'firebase-admin';
  import { Request, Response, NextFunction } from 'express';

  export async function requireAppCheck(req: Request, res: Response, next: NextFunction) {
    const appCheckToken = req.header('X-Firebase-AppCheck');
    if (!appCheckToken) {
      return res.status(401).json({
        type: 'https://pharmadesk.in/errors/app-check-missing',
        title: 'Unauthorized Client Request',
        status: 401,
        detail: 'The request did not include a valid Firebase App Check attestation token.'
      });
    }

    try {
      await admin.appCheck().verifyToken(appCheckToken);
      next();
    } catch (err) {
      return res.status(401).json({
        type: 'https://pharmadesk.in/errors/app-check-failed',
        title: 'Client Attestation Failed',
        status: 401,
        detail: 'The provided App Check token could not be verified.'
      });
    }
  }
  ```

---

### 2.6 Service 6: Firebase Analytics (Privacy-Governed Operational Telemetry)
* **Role:** User experience optimization and counter checkout performance telemetry.
* **Strict Privacy Boundary under DPDP Act 2023:**
  * **Explicitly Permitted Telemetry:**
    * Page navigation events (`view_billing_screen`, `view_inventory_screen`).
    * Performance latency metrics (duration from barcode scan to receipt print).
    * Generic feature engagement (e.g. `used_barcode_scanner = true`, `printer_format = 'thermal_80mm'`).
    * Error tracking envelopes (HTTP status codes, network retry counts).
  * **Strictly Prohibited Telemetry (Zero PHI & PII):**
    * ❌ No patient or customer names, addresses, or telephone numbers.
    * ❌ No medicine brand names, formulation salts, or dosage strengths.
    * ❌ No financial transaction values or invoice amounts.
    * ❌ No doctor names or state medical registration numbers.
* **Client Implementation Safeguard:**
  ```typescript
  import { getAnalytics, logEvent } from 'firebase/analytics';

  export function trackCounterBillingCompleted(itemCount: number, durationSeconds: number) {
    const analytics = getAnalytics();
    logEvent(analytics, 'billing_transaction_completed', {
      item_count: itemCount,
      duration_seconds: durationSeconds,
      // Zero patient or drug identifiers passed to analytics
    });
  }
  ```

---

### 2.7 Service 7: Firebase Hosting (Optional / Hybrid Static Delivery)
* **Role:** High-availability edge content delivery network (CDN) for the React 19 single-page application.
* **Hybrid Deployment Option:**
  * **Option A (All-in-One Cloud Run):** Express serves the compiled Vite static assets from `/dist` and handles `/api/*` endpoints within a single container. Recommended for initial pilot simplicity.
  * **Option B (Firebase Hosting + Cloud Run Backend):**
    * Firebase Hosting serves static assets (`index.html`, JavaScript, CSS, images) from Google's global multi-region edge caches.
    * `firebase.json` rewrites API traffic seamlessly to the Cloud Run service in Mumbai (`asia-south1`):
      ```json
      {
        "hosting": {
          "public": "dist",
          "ignore": ["firebase.json", "**/.*"],
          "rewrites": [
            {
              "source": "/api/**",
              "run": {
                "serviceId": "pharmadesk-api",
                "region": "asia-south1"
              }
            },
            {
              "source": "**",
              "destination": "/index.html"
            }
          ]
        }
      }
      ```
    * *Benefit of Option B:* Static assets load with sub-10ms edge caching; Cloud Run containers process zero static asset requests, reducing container CPU load.

---

## 3. Failure Handling & Degradation Resilience Matrix

| Firebase Service | Failure Condition | System Impact | Degradation Handling & Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **Firebase Auth** | Google IdP outage or transient network failure | Staff unable to sign in with new credentials | Existing authenticated sessions continue operating using valid local JWTs until 60-minute expiry. Dedicated UI modal notifies: `Authentication Service Degraded`. Counter checkout for active sessions remains uninterrupted. |
| **Cloud Firestore** | Firestore API connection failure or quota exhaustion | Live counter presence and draft locks unavailable | Core POS billing continues 100% on PostgreSQL. Pessimistic row locking on PostgreSQL `inventory_batches` continues to guarantee concurrency safety. Presence indicator displays `Offline / Standalone Mode`. |
| **FCM Notifications**| Push delivery delayed or token invalid | Push notification not delivered to mobile phone | Non-fatal. In-app notifications stored in PostgreSQL `audit_logs` and notification drawer remain completely accessible upon user check. |
| **Firebase App Check**| Attestation service failure | Risk of false-positive request rejections | App Check enforcement middleware includes a configurable emergency bypass flag (`APP_CHECK_ENFORCEMENT=permissive`) controllable via Google Cloud Secret Manager to prevent store checkout outages. |
| **Firebase Analytics**| Network ad-blocker or analytics block | Telemetry data omitted | Completely silent failure. Zero impact on application functionality or counter billing operations. |

---

## 4. Financial Cost Profile & Free Tier Quota Verification

To prevent unexpected cloud billing spikes, Firebase usage is configured within cost-conscious guardrails:

| Service | Spark Free Tier Allocation | Estimated PharmaDesk Consumption (Pilot: 25 Stores) | Cost Status |
| :--- | :--- | :--- | :--- |
| **Firebase Auth (Phone OTP)** | 10,000 verifications / month free (Spark/Blaze) | ~150 verifications / month (Staff log in once daily or maintain active session) | Free / Negligible |
| **Cloud Firestore** | 50,000 reads/day, 20,000 writes/day, 1 GB storage | Minimal (~2,000 writes/day for workstation presence heartbeats) | 100% within Free Tier |
| **Firebase Cloud Messaging** | Completely Free (Unlimited push messages) | ~500 push notifications / day | Free |
| **Firebase App Check** | 10,000 reCAPTCHA Enterprise verifications / month free | ~8,000 counter checkout requests / month | Free |
| **Firebase Hosting** | 10 GB storage, 360 MB/day transfer | ~50 MB static bundle, cached via CDN | Free |

**Cost Verification Rule:**
PharmaDesk utilizes Firebase within its perpetual free allocations during Pilot and Early Growth phases. Firestore reads/writes are strictly constrained by storing only ephemeral presence heartbeats (throttled to 60-second intervals), avoiding high-frequency database polling loops.
