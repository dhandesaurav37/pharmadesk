# PharmaDesk Production Readiness & Regulatory Risk Assessment

**Document Version:** 1.0.0  
**Classification:** Operational Risk Register & Legal Compliance Disclosure  
**Target Jurisdiction:** Republic of India (CDSCO, State Drug Control Administrations, GST Council, MeitY)  

---

> ### CRITICAL REGULATORY & LEGAL DISCLAIMER
> **Do not claim PharmaDesk is legally compliant or production-ready merely because this architecture documentation exists.**  
> Pharmaceutical dispensing in India is strictly governed by statutory legislation including the **Drugs and Cosmetics Act, 1940**, the **Drugs and Cosmetics Rules, 1945**, the **Pharmacy Act, 1948**, the **Narcotic Drugs and Psychotropic Substances (NDPS) Act, 1985**, and the **Central Goods and Services Tax (CGST) Act, 2017**.  
> Prior to deploying PharmaDesk to live commercial pharmacies, all clinical dispensing logic, controlled substance registers, and tax invoicing routines must undergo rigorous validation and formal review by qualified legal counsel, registered pharmacists, and certified GST practitioners.

---

## 1. Regulatory Compliance Risks (Indian Pharmacy Standards)

### 1.1 Schedule H1 Controlled Drug Register
- **Statutory Mandate:** Under Rule 65 of the Drugs and Cosmetics Rules, 1945, specified antibiotics (e.g., Cefixime, Levofloxacin), anti-TB drugs, and habit-forming drugs listed under Schedule H1 must be recorded in a separate register. The register must capture:
  1. Date of dispensing.
  2. Patient name and complete address.
  3. Prescribing Doctor's name, qualifications, and State/National Medical Council registration number.
  4. Name and quantity of the medicine dispensed.
  5. Manufacturer and batch number.
  6. Signature/verification of the registered pharmacist.
- **Risk Analysis:** If a cashier or automated POS issues an invoice containing a Schedule H1 item without capturing the prescribing doctor's registration number or physical prescription scan, the pharmacy owner faces immediate statutory suspension or cancellation of Drug Licenses (Form 20B and 21B).
- **Engineering Mitigation:**
  - The API contract strictly mandates `doctorRegNumber` when any cart item carries `schedule_class = 'Schedule H1'`.
  - An immutable Schedule H1 audit view (`/api/v1/reports/statutory/schedule-h1`) must be generated for on-demand inspection by State Drug Inspectors.

### 1.2 Schedule X and Narcotic Drugs (NDPS Act)
- **Statutory Mandate:** Extreme restrictions apply to psychotropic and narcotic substances (e.g., Ketamine, Methylphenidate, Buprenorphine). Records must be preserved for at least 2 years and duplicate physical prescription copies must be maintained for 3 years.
- **Risk Analysis:** Automated electronic refills or dispensing without authenticated prescription verification carries severe criminal liability under the NDPS Act.
- **Engineering Mitigation:**
  - Phase 1 and Phase 2 restrict Schedule X to registered `PHARMACIST` and `OWNER` roles with dual confirmation.
  - Digital scans of physical prescriptions must be uploaded to Cloud Storage before the invoice can be finalized.

### 1.3 Physical Presence of Registered Pharmacist
- **Statutory Mandate:** Section 42 of the Pharmacy Act, 1948 prohibits anyone other than a Registered Pharmacist from dispensing medicines.
- **Risk Analysis:** Allowing uncertified helpers or remote cashiers to bill prescription medicines without active on-premises pharmacist supervision breaches licensing conditions.
- **Engineering Mitigation:**
  - Cashier roles require an active Pharmacist on duty to approve Schedule H/H1 items.
  - Pharmacist council registration numbers and expiration dates are tracked in the `users` table.

---

## 2. Taxation & Financial Risks (Indian GST Architecture)

### 2.1 GST Inclusive vs. Exclusive Price Calculations
- **Indian Retail Standard:** In Indian retail pharmacies, medicine Maximum Retail Price (MRP) printed on packs is statutory and **inclusive of all taxes**.
- **Calculation Formula:**
  $$\text{Taxable Value} = \frac{\text{Net Sale Price}}{1 + \frac{\text{GST Rate}}{100}}$$
  $$\text{CGST} = \text{SGST} = \frac{\text{Net Sale Price} - \text{Taxable Value}}{2}$$
- **Risk Analysis:** Naive implementations that add GST *on top* of the printed MRP violate the Legal Metrology Act, 2009 (charging above MRP is a punishable offense) and generate faulty GSTR-1 tax returns.
- **Engineering Mitigation:**
  - Database schema and API calculation routines compute backwards from discounted Net MRP, ensuring line total never exceeds statutory MRP.

### 2.2 Multiple Tax Slabs across Formulations
- Formulations fall under disparate GST slabs:
  - 0%: Essential life-saving humanitarian donations, human blood.
  - 5%: Vaccines, life-saving oncology/cardiac formulations, insulin.
  - 12%: Standard allopathic formulations, antibiotics, analgesics (majority of pharmacy inventory).
  - 18%: Derma cosmetics, disinfectants, medicated shampoos, dietary supplements.
- **Risk Analysis:** Incorrect tax slab assignment leads to tax demand notices from the Directorate General of GST Intelligence (DGGI).
- **Engineering Mitigation:**
  - Tax slabs are tied directly to the `medicine_master` record and immutable at the batch level.

---

## 3. Data Privacy & Healthcare Record Protection

### 3.1 Digital Personal Data Protection Act, 2023 (DPDP Act)
- **Risk Analysis:** Patient names, telephone numbers, and prescription histories constitute sensitive personal data. Unencrypted storage or platform staff browsing medical records breaches the DPDP Act, attracting penalties up to ₹250 Crores.
- **Engineering Mitigation:**
  - Strict tenant and branch isolation via PostgreSQL Row-Level Security (RLS).
  - Customer phone numbers and addresses encrypted at rest.
  - Platform administrators have no default backdoor to view patient medical histories.

### 3.2 Statutory Record Retention Schedule
- **Drugs & Cosmetics Rules:** Prescriptions and batch registers must be preserved for a minimum of **3 years**.
- **GST Invoicing Rules:** Invoices and input tax credit (ITC) inward bills must be preserved for **6 years** (72 months from the due date of the annual return).
- **Engineering Mitigation:**
  - Hard deletion (`DELETE FROM sales_invoices`) is strictly blocked by database trigger.
  - Automated weekly database dumps are retained in GCS Coldline storage with 7-year object lock.

---

## 4. Operational & High-Availability Risks

### 4.1 Retail Counter Internet Interruption
- **Risk Analysis:** Indian retail medical stores frequently experience broadband and cellular connectivity outages during monsoons or local fiber cuts. If a cloud-only POS fails during an emergency medicine dispense, the patient is compromised and business stops.
- **Engineering Mitigation:**
  - Offline-first caching with client-side UUID generation and queued synchronization via service workers and IndexedDB in subsequent phases.

### 4.2 High-Velocity Multi-Workstation Race Conditions
- **Risk Analysis:** Multiple cashiers at Counter 1 and Counter 2 attempting to sell the final remaining strip of a high-demand batch simultaneously can result in negative inventory or double-dispense.
- **Engineering Mitigation:**
  - PostgreSQL pessimistic row locks (`SELECT ... FOR UPDATE`) during invoice creation.
  - Database trigger `trg_fn_prevent_negative_inventory()` raises a hard SQL exception if `current_stock < 0`.

---

## 5. Security & Threat Modeling

| Threat Vector | Severity | Impact | Mitigation Strategy |
| :--- | :---: | :--- | :--- |
| **Tenant Cross-Contamination** | Critical | Store A views Store B's patient or sales records | Enforced at 3 layers: Express middleware, repository parameterization, and PostgreSQL Row-Level Security (RLS). |
| **Duplicate Invoice Generation** | High | Cashier double-clicks payment; double-deducts stock and doubles customer Khata | Mandatory client-generated `idempotency_key` with unique database constraint. |
| **Tampering with Historic Bills** | High | Dishonest staff edits invoice totals post-closing to pocket cash | Sales invoices are immutable; updates to financial totals blocked by database trigger. |
| **Rogue Support Impersonation** | High | SaaS vendor support accesses confidential competitor pharmacy data | No permanent platform administrative backdoors; customer-authorized time-bound access tokens required. |
