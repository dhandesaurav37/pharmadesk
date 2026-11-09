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
- **Authentication**: Firebase Authentication for client identity verification; PostgreSQL for tenant membership, branch assignment, and RBAC authorization
- **Object Storage**: Private Google Cloud Storage (Encrypted documents & prescriptions)

## Cloud Architecture & Engineering Blueprint

Comprehensive system architecture and relational database designs are detailed in the `/docs` directory:

1. [Architecture Decision Records (`docs/architecture-decisions.md`)](./docs/architecture-decisions.md): 12 foundational ADRs documenting multi-tenancy, composite isolation, decoupled auth, double-entry accounting, and cloud infrastructure choices.
2. [Database Integrity & Relational Isolation Audit (`docs/database-integrity-audit.md`)](./docs/database-integrity-audit.md): Table-by-table audit of all 43 schema entities verifying composite foreign keys, normalized junctions, and fail-closed RLS.
3. [Cloud Architecture & Topology (`docs/architecture.md`)](./docs/architecture.md): Modular monolith design, multi-tenant isolation, branch-level access, cost-conscious Cloud Run/SQL sizing, and failure mode matrix.
4. [Relational Database Schema (`docs/database-schema.md`)](./docs/database-schema.md): Hardened 3NF normalized PostgreSQL schema with composite tenant keys `(tenant_id, id)`, normalized `membership_branches` and `invitation_branches`, double-entry chart of accounts, negative stock prevention triggers, and Row-Level Security (RLS).
5. [Employee Permission & RBAC Model (`docs/permissions-matrix.md`)](./docs/permissions-matrix.md): Granular roles (`OWNER`, `PHARMACIST`, `CASHIER`, `HELPER`), dot-notated permissions, user overrides, and server-side authorization enforcement.
6. [End-to-End Business Workflows (`docs/business-workflows.md`)](./docs/business-workflows.md): Operational lifecycles (Onboarding, Employee lifecycle, Inventory batch management, POS billing concurrency, Khata credit, Supplier goods receipt, and financial report formulas).
7. [REST API Contracts (`docs/api-contracts.md`)](./docs/api-contracts.md): RESTful endpoint specifications across 12 modules, RFC 7807 error handling, and transactional boundaries.
8. [Security, Data Privacy & Backups (`docs/security-and-data-protection.md`)](./docs/security-and-data-protection.md): Defense-in-depth security, private VPC, Secret Manager, DPDP Act 2023 compliance, automated backup restore testing, and disaster recovery runbooks.
9. [Prototype-to-Cloud Migration Plan (`docs/migration-plan.md`)](./docs/migration-plan.md): Safe, 7-stage migration strategy from prototype `localStorage` to cloud persistence with verifiable checksum validation.
10. [Production Readiness & Regulatory Risks (`docs/production-readiness-risks.md`)](./docs/production-readiness-risks.md): Tripartite statutory classification framework, Indian pharmacy laws (Schedule H1/X, Form 20B/21B, GST inclusive calculations), and operational threat model.
11. [Testing Strategy & Quality Gates (`docs/testing-strategy.md`)](./docs/testing-strategy.md): Database tests (composite FKs, RLS, triggers), authorization tests, concurrent billing race conditions, and release gates.
12. [12-Phase Implementation Roadmap (`docs/implementation-roadmap.md`)](./docs/implementation-roadmap.md): Granular execution sequence with migrations, endpoints, tests, and acceptance criteria.
13. [Firebase Services Architecture (`docs/firebase-services-architecture.md`)](./docs/firebase-services-architecture.md): Managed services boundary (Auth, Admin SDK, Firestore presence, FCM notifications, App Check bot attestation, DPDP-compliant Analytics, and optional Hosting) with PostgreSQL transactional authority.

## Running the Application

### Frontend Development (Vite + React 19)
```bash
# Start frontend preview development server (port 3000)
npm run dev
# or
npm run dev:frontend
```

### Backend Development (Express + TypeScript Modular Monolith)
For full documentation on the backend foundation, see [`server/README.md`](./server/README.md).
```bash
# Run backend server in development mode (port 3001)
npm run dev:backend

# Run automated backend test suite (Vitest + Supertest)
npm run test:backend

# Database Management (Phase 2 PostgreSQL)
npm run db:check    # Check database connectivity & measure latency
npm run db:status   # Check schema migration status & verify checksums
npm run db:migrate  # Apply pending SQL migrations sequentially
```

### Verification & Validation Scripts
```bash
# Type check both frontend and backend
npm run typecheck

# Build frontend for production
npm run build:frontend

# Build backend TypeScript
npm run build:backend

# Full end-to-end repository validation
npm run validate
```
