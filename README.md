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
- **Planned Backend**: Node.js / TypeScript, PostgreSQL (Cloud SQL), Firebase Authentication (custom role claims)

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
