# PharmaDesk Production Readiness & Regulatory Risk Assessment

**Document Version:** 2.0.0 (Hardened Compliance Register)  
**Classification:** Operational Risk Register & Statutory Classification Model  
**Target Jurisdiction:** Republic of India (CDSCO, State Drug Control Administrations, GST Council, MeitY)  

---

> ### CRITICAL REGULATORY & LEGAL DISCLAIMER
> **Do not claim PharmaDesk is legally compliant or production-ready merely because this architecture documentation exists.**  
> Pharmaceutical dispensing in India is strictly governed by statutory legislation including the **Drugs and Cosmetics Act, 1940**, the **Drugs and Cosmetics Rules, 1945**, the **Pharmacy Act, 1948**, the **Narcotic Drugs and Psychotropic Substances (NDPS) Act, 1985**, and the **Central Goods and Services Tax (CGST) Act, 2017**.  
> Prior to deploying PharmaDesk to live commercial pharmacies, all clinical dispensing logic, controlled substance registers, and tax invoicing routines must undergo rigorous validation and formal review by qualified legal counsel, registered pharmacists, and certified GST practitioners.

---

## 1. Tripartite Statutory Classification Framework

To ensure engineering rigor without hardcoding unverified assumptions, PharmaDesk separates compliance items into three distinct categories:

```
+---------------------------------------------------------------------------------------------------------+
| CATEGORY 1: VERIFIED SYSTEM REQUIREMENTS (Firm Architectural Primitives)                                 |
| - Standard retail medicine MRP in India is statutory and inclusive of all taxes.                        |
| - Line items cannot exceed printed pack MRP under Legal Metrology Act, 2009.                            |
| - Every tax invoice must display Pharmacy Name, Shop Address, DL Form 20B/21B, and GSTIN.               |
| - Issued sales invoices must be immutable for tax audit trails.                                         |
| - Negative stock dispensing must be rejected by ACID database triggers.                                 |
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
| - WhatsApp delivery of tax invoices as valid legal cash memo under state Commercial Tax departments.    |
| - E-invoicing QR code thresholds for B2B wholesale depot stock transfers.                              |
| - Patient consent wording under Digital Personal Data Protection (DPDP) Act 2023 for Khata reminders.    |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Controlled Substances & Statutory Registers

### 2.1 Schedule H1 Controlled Drug Register (Rule 65)
- **Mandate:** Specified 3rd/4th generation cephalosporins, carbapenems, fluoroquinolones, and habit-forming drugs must be maintained in a separate register.
- **System Defense:**
  - When an item marked `schedule_class = 'Schedule H1'` is added to an invoice, the UI mandates:
    1. Prescribing Doctor's Full Name.
    2. Prescribing Doctor's State / National Medical Council Registration Number.
  - The API rejects checkout if these fields are absent.
  - An exportable, unalterable statutory register (`/api/v1/reports/statutory/schedule-h1`) is available on demand for State Drug Inspectors.

### 2.2 Schedule X and Narcotic Drugs (NDPS Act, 1985)
- **Extreme Restriction:** Dispensing psychotropic drugs requires dual authorization and preservation of prescription records.
- **System Defense:** Cashier roles are strictly blocked from dispensing Schedule X drugs (`billing.schedule_h1` required). A digital prescription scan must be attached to the invoice record in Cloud Storage.

---

## 3. GST Taxation & Calculation Mechanics

### 3.1 Reverse Tax Derivation from Inclusive MRP
Medicine pricing in Indian retail is statutory and inclusive of all taxes. The software must compute backward:
$$\text{Taxable Value} = \frac{\text{Net Sale Price}}{1 + \frac{\text{GST Rate}}{100}}$$
$$\text{CGST} = \text{SGST} = \frac{\text{Net Sale Price} - \text{Taxable Value}}{2}$$
- **Zero-Markup Invariant:** The database trigger verifies `unit_sale_price <= mrp`. Charging above MRP is illegal under the Legal Metrology Act.

### 3.2 Formulation Slabs
- 0%: Human blood, vaccines under government programs.
- 5%: Life-saving vaccines, insulin, select oncology formulations.
- 12%: Standard allopathic formulations (analgesics, antibiotics, cardiovascular, anti-diabetic).
- 18%: Disinfectants, medicated cosmetics, nutritional food supplements (FSSAI).

---

## 4. Sensitive Patient Health Data & Privacy (DPDP Act, 2023)

### 4.1 Data Minimization & Privacy Protection
- **Least Privilege Access:** Helper roles cannot view patient names, phone numbers, or prescription history. Cashiers see patient information only within the active counter transaction.
- **Customer Phone & Address Protection:** Stored encrypted at rest using AES-256 in PostgreSQL Cloud SQL.
- **Audit Logging:** Every bulk export of customer contact information triggers an immutable entry in `audit_logs`.

---

## 5. Security & Threat Modeling Register

| Threat Vector | Severity | Mitigation Strategy |
| :--- | :---: | :--- |
| **Cross-Tenant Data Exposure** | Critical | Enforced via Composite Foreign Keys `(tenant_id, id)` and PostgreSQL Row-Level Security. |
| **Concurrent Overselling** | High | Pessimistic locks (`SELECT ... FOR UPDATE`) during checkout; trigger `trg_check_inventory_stock` blocks negative stock. |
| **Duplicate Billing Submission** | High | Mandatory `Idempotency-Key` header with database unique constraint. |
| **Post-Closing Bill Tampering** | High | Trigger `trg_protect_sales_invoices` strictly prohibits modifying financial totals or deleting completed invoices. |
| **Rogue Support Impersonation** | High | SaaS vendor support has zero direct database backdoors; requires customer-authorized, time-bound tokens. |
