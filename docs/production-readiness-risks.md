# PharmaDesk Production Readiness & Regulatory Risk Assessment

**Document Version:** 4.0.0 (Standardized Firebase Compliance & Phase 11 Hardening Register)  
**Classification:** Operational Risk Register & Statutory Classification Model  
**Target Jurisdiction:** Republic of India (CDSCO, State Drug Control Administrations, GST Council, MeitY)  

---

> ### CRITICAL REGULATORY & LEGAL DISCLAIMER
> **Do not claim PharmaDesk is legally compliant or production-ready merely because this architecture documentation exists.**  
> Pharmaceutical dispensing in India is strictly governed by statutory legislation including the **Drugs and Cosmetics Act, 1940**, the **Drugs and Cosmetics Rules, 1945**, the **Pharmacy Act, 1948**, the **Narcotic Drugs and Psychotropic Substances (NDPS) Act, 1985**, and the **Central Goods and Services Tax (CGST) Act, 2017**.  
> Prior to deploying PharmaDesk to live commercial pharmacies, all clinical dispensing logic, controlled substance registers, and tax invoicing routines must undergo rigorous validation and formal review by qualified legal counsel, registered pharmacists, and certified GST practitioners.

---

## 1. Tripartite Statutory Classification Framework

```text
+---------------------------------------------------------------------------------------------------------+
| CATEGORY 1: VERIFIED SYSTEM REQUIREMENTS (Firm Architectural Primitives)                                 |
| - Standard retail medicine MRP in India is statutory and inclusive of all taxes.                        |
| - Line items cannot exceed printed pack MRP under Legal Metrology Act, 2009.                            |
| - Every tax invoice must display Pharmacy Name, Shop Address, DL Form 20B/21B, and GSTIN.               |
| - Issued sales invoices are immutable tax snapshots; voids/returns append reversing records cleanly.    |
| - Expired batches and negative stock dispensing are strictly rejected inside Firestore ACID transactions.|
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------------+
| CATEGORY 2: CONFIGURABLE BUSINESS RULES (Tenant-Administered Operational Settings)                       |
| - Default customer prescription discount percentage (0% to 20%).                                        |
| - Customer Khata credit limit threshold (default ₹5,000, customizable per patient).                     |
| - Near-expiry alert window (30 days, 60 days, or 90 days prior to batch expiration).                    |
| - Invoice receipt printer dimensions (80mm continuous thermal roll vs. A4/A5 duplicate tax invoice).    |
| - Reorder minimum stock threshold per formulation (default 15 packs).                                  |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------------+
| CATEGORY 3: REGULATORY ASSUMPTIONS REQUIRING QUALIFIED REVIEW (Pre-Production Legal Gates)             |
| - Mandatory preservation duration for Schedule H1 registers (3 years vs. 5 years under state drug rules).|
| - Physical vs. electronic signature validity of Registered Pharmacist on digital POS receipts.          |
| - Digital delivery of tax invoices as valid cash memo under state Commercial Tax departments.           |
| - E-invoicing QR code thresholds for B2B wholesale depot stock transfers.                              |
| - Patient consent wording under Digital Personal Data Protection (DPDP) Act 2023 for Khata reminders.    |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Controlled Substances & Statutory Registers

### 2.1 Schedule H1 Controlled Drug Register (Rule 65)
- **Mandate:** Specified 3rd/4th generation cephalosporins, carbapenems, fluoroquinolones, and habit-forming drugs must be maintained in a separate register.
- **System Defense:**
  - When Schedule H/H1/X formulations are billed, the POS requires:
    1. Prescribing Doctor's Full Name.
    2. Prescribing Doctor's State / National Medical Council Registration Number.
  - Printable invoices capture doctor details and Form 20B/21B license metadata.

### 2.2 Schedule X and Narcotic Drugs (NDPS Act, 1985)
- **Extreme Restriction:** Dispensing psychotropic drugs requires pharmacist authorization (`billing.schedule_h1`) and digital prescription preservation in tenant/branch-scoped Firebase Storage (`tenants/{tenantId}/branches/{branchId}/prescriptions/...`).

---

## 3. GST Taxation & Calculation Mechanics

### 3.1 Reverse Tax Derivation from Inclusive MRP
Medicine pricing in Indian retail is statutory and inclusive of all taxes. `BillingTransactionService` computes backward using paise rounding (`roundPaise`) after discounts:
$$\text{Taxable Value} = \frac{\text{Net Sale Price}}{1 + \frac{\text{GST Rate}}{100}}$$
- **Intra-State:** Tax split 50/50 into CGST and SGST (paise-safe remainder assigned cleanly).
- **Inter-State:** Tax recorded 100% as IGST.
- **Zero-Markup Invariant:** Authoritative server pricing validates `unitPrice <= mrp`.

### 3.2 Formulation Slabs
- `0%`: Human blood, select government program vaccines.
- `5%`: Life-saving vaccines, insulin, select essential formulations.
- `12%`: Standard allopathic formulations.
- `18%`: Disinfectants, medicated cosmetics, nutritional supplements (FSSAI).

---

## 4. Sensitive Patient Health Data & Privacy (DPDP Act, 2023)

- **Least Privilege Access:** `helper` roles cannot view patient names, phone numbers, or invoices; `cashier` roles cannot inspect wholesale PTR margins.
- **Data at Rest & Transport:** Protected via TLS 1.3 and Google-managed encryption in Cloud Firestore and Firebase Storage (`asia-south1` Mumbai).
- **No Local Business Persistence:** Business and patient data is never persisted in browser `localStorage` or `IndexedDB`.
- **Audit Logging:** Sensitive administrative actions and bulk operations write immutable entries to `tenants/{tenantId}/audit_logs`.

---

## 5. Security & Threat Modeling Register

| Threat Vector | Severity | Mitigation Strategy |
| :--- | :---: | :--- |
| **Cross-Tenant Data Exposure** | Critical | Enforced via Firestore tenant subcollections (`/tenants/{tenantId}/...`), `firestore.rules`, `storage.rules`, and `tenantAuthorizationMiddleware`. |
| **Concurrent Overselling** | High | Cloud Firestore ACID `runTransaction` validates live `currentStock >= quantity` and blocks negative stock or expired batches. |
| **Duplicate Billing Submission** | High | Mandatory `Idempotency-Key` with recursive canonical SHA-256 payload hashing in `idempotency_keys`. |
| **Post-Closing Bill Tampering** | High | `sales_invoices` retain immutable snapshots; cancellations and returns record explicit audit events and stock restoration movements (`SALE_RETURN` / `MANUAL_ADJUSTMENT`). |
| **Deactivated Employee Token Reuse** | High | `tenantAuthorizationMiddleware` validates live Firestore `memberships/{userId}.status === 'active'` on every API request. |
| **Cross-Branch / Privilege Escalation** | High | Explicit branch checks enforced on single-record endpoints, invitation tokens masked post-issuance, non-owner inviters locked to assigned branches without `permissionOverrides`, and CSV formula injection neutralized. |
| **Stored SVG XSS & PHI Log Leakage** | High | `storage.rules` & `StorageService` block `image/svg+xml` and enforce safe MIME/extension parity; Pino and `AuditService` redact PHI, phone numbers, bank accounts, and tokens. |
| **Staging GCP DR & Runtime Gates Pending** | Medium | Cloud Firestore PITR, GCS Coldline backup buckets, Cloud Secret Manager, Cloud Armor WAF, and Java-backed Firebase Emulator Suite require live GCP/staging verification before pilot go-live. |
