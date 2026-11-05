# PharmaDesk — Cloud-Based Pharmacy Management Platform

PharmaDesk is a modern cloud-based pharmacy management platform engineered for independent medical stores, medium-sized retail pharmacies, and multi-branch pharmacy businesses in India.

## Key Features

- **Dashboard**: High-level store operations, daily sales metrics, inventory counts, near-expiry alerts, and Schedule H1 statutory compliance.
- **Billing Terminal (POS)**: High-speed counter dispensing terminal with batch-level expiry selection, automatic GST calculations (CGST/SGST), doctor prescription requirements for Schedule H/H1 drugs, dynamic UPI QR preview, and retail tax invoice printing.
- **Medicines Master Directory**: Formularies categorized by dosage forms (Tablets, Capsules, Syrups, Injections, Ointments, Powders) and schedule classes (OTC, Schedule H, Schedule H1, Schedule X) with rack/shelf location tracking.
- **Inventory & Batches**: Batch-level inventory management with expiry tracking (normal, low stock, near-expiry), PTR purchase rates, MRP, and gross retail margin calculations.
- **Customers & Khata Ledger**: Patient profiles, doctor linkage, credit balances, and cash settlement ledger.
- **Suppliers & Stockists**: Wholesale distributor management with Drug License (DL Form 20B/21B) and GSTIN records.
- **Store Settings & Onboarding**: Store configuration wizard for legal drug licenses, GSTIN, thermal (80mm) vs. A4 invoice printing, and role-based access control (RBAC).

## Technology Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **Backend Architecture**: Node.js / TypeScript (Modular Monolith on Google Cloud Run)
- **Database**: PostgreSQL 16 on Google Cloud SQL (`asia-south1` Mumbai) with Row-Level Security
- **Authentication**: Firebase Authentication (Multi-tenant with custom claims)
- **Object Storage**: Private Google Cloud Storage (Encrypted documents & prescriptions)

## Cloud Architecture & Engineering Specifications

Comprehensive system architecture and relational database designs are detailed in the `/docs` directory:

1. [Cloud Architecture & Topology (`docs/architecture.md`)](./docs/architecture.md): Modular monolith design, multi-tenant isolation, branch-level access, and Google Cloud Run/SQL deployment topology.
2. [Relational Database Schema (`docs/database-schema.md`)](./docs/database-schema.md): Complete 3NF normalized PostgreSQL schema covering 26 core tables, strict financial precision (`NUMERIC`), UTC timestamps, negative stock prevention triggers, and Row-Level Security (RLS).
3. [Employee Permission & RBAC Model (`docs/permissions-matrix.md`)](./docs/permissions-matrix.md): Granular roles (Owner, Pharmacist, Cashier, Helper), user overrides, and server-side authorization enforcement.
4. [REST API Contracts (`docs/api-contracts.md`)](./docs/api-contracts.md): RESTful endpoint specifications across 14 modules, RFC 7807 error handling, and transactional boundaries.
5. [Prototype-to-Cloud Migration Plan (`docs/migration-plan.md`)](./docs/migration-plan.md): Safe, phased migration strategy from `localStorage` prototype to cloud persistence with zero data loss.
6. [Production Readiness & Regulatory Risks (`docs/production-readiness-risks.md`)](./docs/production-readiness-risks.md): Indian statutory compliance (Schedule H1/X, Form 20B/21B, GST inclusive calculations, DPDP Act 2023) and operational risk assessment.

## Running the Application

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run TypeScript type check
npm run lint

# Build for production
npm run build
```
