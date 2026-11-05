# PharmaDesk Prototype-to-Cloud Migration Plan

**Document Version:** 1.0.0  
**Target:** Transition from Browser `localStorage` Prototype to PostgreSQL & Backend API  
**Strategy:** Phased Strangler-Fig Migration with Zero Data Loss & Reversible Rollback  

---

## 1. Inventory of Current Prototype `localStorage` Usage

The existing PharmaDesk Phase 1 implementation stores prototype state in browser `localStorage` via `src/context/PharmacyContext.tsx`.

### 1.1 Identified Storage Keys & Domain Bindings

| `localStorage` Key | Fallback Key | Data Domain | Consuming Components | Target Backend Table |
| :--- | :--- | :--- | :--- | :--- |
| `pharmadesk_store` | `medidesk_store` | Store profile, DL 20B/21B, GSTIN, invoice prefix | `SettingsView`, `StoreOnboardingModal`, `TopHeader`, `PrintInvoiceModal`, `Sidebar` | `tenants`, `branches` |
| `pharmadesk_medicines` | `medidesk_medicines` | Medicine Master catalog, salts, manufacturers | `MedicinesView`, `AddMedicineModal`, `BillingView`, `DashboardView` | `medicine_master` |
| `pharmadesk_inventory` | `medidesk_inventory` | Inward stock batches, expiry dates, pack sizes, MRP, PTR | `InventoryView`, `AddStockModal`, `BillingView`, `DashboardView`, `Sidebar` | `inventory_batches`, `stock_movements` |
| `pharmadesk_customers` | `medidesk_customers` | Customer/patient profiles, Khata credit ledger | `CustomersView`, `AddCustomerModal`, `BillingView` | `customers`, `customer_ledger` |
| `pharmadesk_suppliers` | `medidesk_suppliers` | Pharmaceutical distributors, wholesale licenses, payables | `SuppliersView`, `DashboardView` | `suppliers`, `supplier_ledger` |
| `pharmadesk_bills` | `medidesk_bills` | Retail counter sales tax invoices | `BillingView`, `DashboardView`, `PrintInvoiceModal` | `sales_invoices`, `sales_invoice_items`, `payments` |
| `pharmadesk_user_role` | `medidesk_user_role` | Active testing role selection (`owner`, `pharmacist`, `cashier`) | `Sidebar`, `TopHeader`, `LoginModal` | Replaced by Firebase JWT custom claims (`tenant_memberships`) |

---

## 2. Permitted vs. Prohibited Uses of Browser Storage

### 2.1 Prohibited in Production (Must Migrate to PostgreSQL)
- **Business Transaction Records:** Invoices, payments, and returns must **never** reside solely in client storage.
- **Stock & Batch Balances:** Quantities and expirations must be centralized in PostgreSQL to prevent race conditions across multiple billing counter workstations.
- **Patient Health Data (PHI):** Doctor names, patient mobile numbers, and Schedule H1 dispense logs must be securely encrypted and access-controlled in the cloud.

### 2.2 Permitted Client-Side Preferences (Can Remain in `localStorage`)
The following non-sensitive UI state items are permitted to remain in client storage:
- `pharmadesk_ui_sidebar_collapsed` (Boolean: compact vs full sidebar)
- `pharmadesk_ui_printer_preview_mode` (Default view: thermal vs A4 layout)
- `pharmadesk_ui_active_table_density` (Compact vs standard row heights)

---

## 3. Five-Phase Migration Strategy

```
  PHASE 1 (Completed)          PHASE 2                     PHASE 3                     PHASE 4                     PHASE 5
+---------------------+      +----------------------+      +----------------------+      +----------------------+      +----------------------+
|  Client Prototype   |      |  Backend & Cloud SQL |      |  Dual-Mode Adapter   |      |  Data Migration &    |      |  Full Cloud API      |
|  - localStorage     | ===> |  - Express REST APIs | ===> |  - React Query Hook  | ===> |    Verification      | ===> |  - Pure Cloud State  |
|  - Sample Data      |      |  - PostgreSQL DDL    |      |  - Export Prototype  |      |  - Zero Data Loss    |      |  - UI Prefs only in  |
|  - Mock Role Switch |      |  - Firebase Auth     |      |  - Feature Flag      |      |  - Rollback Safe     |      |    localStorage      |
+---------------------+      +----------------------+      +----------------------+      +----------------------+      +----------------------+
```

### Phase 1: Baseline Preservation (Current State)
- The existing `PharmacyContext.tsx` and UI components remain completely intact.
- No working checkout or dispensing workflows are altered or broken.

### Phase 2: Cloud Infrastructure & Database Provisioning
1. Provision Google Cloud SQL PostgreSQL instance in `asia-south1`.
2. Apply migrations defined in `docs/database-schema.md`.
3. Deploy Node.js Express modular monolith to Google Cloud Run.
4. Configure Firebase Authentication tenant project.

### Phase 3: Dual-Mode Client Adapter & Export Utility
1. Implement a client-side data exporter inside `SettingsView` (`"Export Store Backup JSON"`). This dumps all current `localStorage` state into a validated JSON envelope.
2. Build an API service client layer (`src/services/api/`) utilizing TanStack Query (React Query) for caching, optimistic updates, and offline fallback.
3. Introduce an environment flag: `VITE_DATA_SOURCE = 'mock' | 'cloud'`.
   - When `'mock'`, the app runs on local memory / prototype storage.
   - When `'cloud'`, all data hooks query `https://api.pharmadesk.in/api/v1`.

### Phase 4: Staged Tenant Migration & Verification
For each live medical store adopting PharmaDesk:
1. **Onboarding Validation:** The pharmacy owner completes the store profile and legal licenses (DL 20B/21B, GSTIN).
2. **Master Formulary Seeding:** Common Indian medicine formulations are seeded into the tenant's `medicine_master` table.
3. **Physical Stock Cut-Over:**
   - The pharmacy performs a physical stock count.
   - Initial batches are inwarded with exact batch numbers, expiry dates, pack sizes, and purchase PTRs.
4. **Data Verification Check:**
   - Sum of batch inventory matches shelf counts.
   - Test invoice generated and verified on the physical thermal printer.

### Phase 5: Deprecation & Clean Up
1. Remove business entity keys (`pharmadesk_store`, `pharmadesk_medicines`, `pharmadesk_inventory`, `pharmadesk_customers`, `pharmadesk_suppliers`, `pharmadesk_bills`) from `localStorage`.
2. Clean up prototype role switches in favor of authenticated Firebase session tokens.
3. Retain only harmless UI preferences in client storage.

---

## 4. Rollback & Disaster Recovery Protocol

If an unexpected connectivity interruption or critical API defect occurs during early pharmacy deployment:

1. **Immediate Read-Only Fallback:** If Cloud Run or Cloud SQL is momentarily unreachable, the client displays an explicit banner:  
   `"Cloud Sync Offline — Operating in Local POS Safety Mode. Transactions will sync upon reconnection."`
2. **Local Session Queue:** Offline invoices are cached locally in an IndexedDB queue with client-generated UUIDs and submitted in order with original idempotency keys once connectivity resumes.
3. **Safe Rollback Flag:** If a major regression is identified in a new API deployment, flipping `VITE_DATA_SOURCE = 'mock'` instantly restores the client interface to the tested prototype state while backend engineers resolve the issue.
