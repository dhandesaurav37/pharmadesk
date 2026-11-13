# PharmaDesk — Cloud-Based Pharmacy Management Platform

PharmaDesk is a modern cloud-based multi-tenant pharmacy management SaaS engineered for independent medical stores, retail pharmacies, and multi-branch pharmacy chains in India.

## Key Features

- **Dashboard**: Store operations overview, daily sales metrics, inventory counts, near-expiry alerts, and Schedule H1 statutory compliance.
- **Billing Terminal (POS)**: High-speed counter dispensing terminal with Barcode Scanner Mode (`F4`), FEFO batch allocation, automatic Indian GST calculations (CGST/SGST vs. IGST), doctor prescription validation for Schedule H/H1/X drugs, split payments, sales returns, invoice cancellation, and thermal (80mm) / A4 printing.
- **Medicines Master Directory**: Formularies categorized by dosage forms and statutory drug schedules (OTC, Schedule H, H1, X) with HSN codes, GST slabs, and barcodes.
- **Inventory & Batches**: Batch-level inventory management with expiry tracking, PTR wholesale rates, MRP, gross retail margin analytics, and immutable `stock_movements`.
- **Staff & RBAC**: Multi-branch employee invitations (72-hour TTL), role-based access control (`owner`, `pharmacist`, `cashier`, `helper`, `auditor`), user-level overrides, and immediate session deactivation.
- **Customers & Suppliers**: Patient profiles, Khata credit ledger tracking, and stockist profiles with DL Form 20B/21B and GSTIN records.

## Standardized Technology Stack

| Layer | Technology | Region / Details |
| :--- | :--- | :--- |
| **Frontend Hosting** | Firebase Hosting | Serves React 19 + TypeScript + Vite + Tailwind CSS v4 SPA (`dist/`) with `/api/**` rewrite |
| **Backend API** | Node.js + Express + TypeScript | Containerized modular monolith on Google Cloud Run (`asia-south1` Mumbai) |
| **Primary Database** | Cloud Firestore | Sole authoritative business database with ACID transactions and tenant-isolated collections |
| **Authentication** | Firebase Authentication | Identity provider (Email/Password, ID tokens verified via Firebase Admin SDK) |
| **File Storage** | Firebase Storage | Tenant- and branch-isolated storage (`invoice_pdfs`, `prescriptions`, `supplier_bills`, `product_images`, `documents`) |
| **Security & Integrity** | Firestore Rules, Storage Rules, App Check | Fail-closed rules + live server-side Firestore membership and branch authorization |
| **Package Manager** | Bun (`bun.lock`) | Standardized dependency installation, test execution, and production builds |

## Cloud Architecture & Engineering Documentation

Comprehensive system blueprints are maintained in the `/docs` directory:

1. [Cloud Architecture & Topology (`docs/architecture.md`)](./docs/architecture.md): Firebase-first topology, Firebase Hosting + Cloud Run (`asia-south1`), Cloud Firestore multi-tenant isolation, and request security pipeline.
2. [Architecture Decision Records (`docs/architecture-decisions.md`)](./docs/architecture-decisions.md): Foundational ADRs documenting Cloud Firestore multi-tenancy, Firebase Auth + live Firestore RBAC, Cloud Run, Firebase Storage, and Mumbai data residency.
3. [Cloud Firestore Data Schema (`docs/database-schema.md`)](./docs/database-schema.md): Authoritative Firestore collection hierarchy (`/tenants/{tenantId}/...`), document schemas, composite indexes, and security boundaries.
4. [Firebase Services Architecture (`docs/firebase-services-architecture.md`)](./docs/firebase-services-architecture.md): Service boundaries across Cloud Firestore, Firebase Auth, Firebase Storage, Firebase Hosting, App Check, and FCM.
5. [Employee Permission & RBAC Model (`docs/permissions-matrix.md`)](./docs/permissions-matrix.md): Roles, dot-notated permissions, user overrides, and live Firestore membership checks.
6. [End-to-End Business Workflows (`docs/business-workflows.md`)](./docs/business-workflows.md): Onboarding, staff RBAC lifecycle, FEFO batch inventory, idempotent POS checkout, split payments, and sales returns.
7. [REST API Contracts (`docs/api-contracts.md`)](./docs/api-contracts.md): Versioned `/api/v1` endpoint specifications across all modules with RFC 7807 Problem Details errors.
8. [Security, Data Privacy & Backups (`docs/security-and-data-protection.md`)](./docs/security-and-data-protection.md): Firestore/Storage rules, App Check, Secret Manager, DPDP Act 2023 compliance, and Firestore PITR/DR.
9. [Prototype-to-Cloud Migration Plan (`docs/migration-plan.md`)](./docs/migration-plan.md): Verification and migration strategy into Cloud Firestore and Firebase Auth.
10. [Production Readiness & Regulatory Risks (`docs/production-readiness-risks.md`)](./docs/production-readiness-risks.md): Indian pharmacy compliance (Schedule H1/X, Form 20B/21B, GST) and operational safeguards.
11. [Testing Strategy & Quality Gates (`docs/testing-strategy.md`)](./docs/testing-strategy.md): Vitest integration suites, authorization/isolation gates, and Firebase Emulator verification.
12. [12-Phase Implementation Roadmap (`docs/implementation-roadmap.md`)](./docs/implementation-roadmap.md): Phase 1–6 completed milestones and Phase 7–12 delivery plan.

## Running & Building with Bun

### Prerequisites
- [Bun](https://bun.sh/) (`>= 1.1`)
- Node.js (`>= 22`) for Cloud Run production runtime compatibility
- Firebase CLI (`firebase-tools`) & Google Cloud CLI (`gcloud`) for Firebase Hosting / Cloud Run deployments

### Installation & Local Development
```bash
# Install all dependencies using Bun (preserves bun.lock)
bun install --frozen-lockfile

# Copy environment template and configure Firebase project variables
cp .env.example .env

# Start frontend preview development server (port 3000)
bun run dev:frontend

# Start backend Express API development server (port 3001)
bun run dev:backend

# Optional: Start local Firebase Emulator Suite (Auth, Firestore, Storage, UI)
docker-compose up -d
```

### Verification, Testing & Production Builds
```bash
# Type check and lint both frontend and backend
bun run lint

# Run automated test suites (Vitest + Supertest)
bun run test

# Build frontend (dist/) for Firebase Hosting & backend (dist/server/server.js) for Cloud Run
bun run build:all

# Full end-to-end repository validation
bun run validate
```

### Deployment Targets
- **Frontend (Firebase Hosting):** `firebase deploy --only hosting,firestore,storage` (serves `dist/` and rewrites `/api/**` to Cloud Run `pharmadesk-api` in `asia-south1`).
- **Backend (Google Cloud Run):** Build container via `Dockerfile` and deploy to `asia-south1` (Mumbai) with `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, and `FIREBASE_APP_CHECK_REQUIRED=true`.
