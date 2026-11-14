/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { PharmacyProvider, usePharmacy } from './context/PharmacyContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { TopHeader } from './components/layout/TopHeader.tsx';
import { NotificationsDrawer } from './components/layout/NotificationsDrawer.tsx';

// Modals
import { StoreOnboardingModal } from './components/modals/StoreOnboardingModal.tsx';
import { LoginModal } from './components/modals/LoginModal.tsx';
import { AddMedicineModal } from './components/modals/AddMedicineModal.tsx';
import { AddCustomerModal } from './components/modals/AddCustomerModal.tsx';
import { AddStockModal } from './components/modals/AddStockModal.tsx';
import { PrintInvoiceModal } from './components/modals/PrintInvoiceModal.tsx';

// Feature Views
import { DashboardView } from './features/dashboard/DashboardView.tsx';
import { BillingView } from './features/billing/BillingView.tsx';
import { MedicinesView } from './features/medicines/MedicinesView.tsx';
import { InventoryView } from './features/inventory/InventoryView.tsx';
import { CustomersView } from './features/customers/CustomersView.tsx';
import { SuppliersView } from './features/suppliers/SuppliersView.tsx';
import { PurchasesView } from './features/purchases/PurchasesView.tsx';
import { SettingsView } from './features/settings/SettingsView.tsx';
import { EmployeesView } from './features/employees/EmployeesView.tsx';
import { AccountsView } from './features/accounts/AccountsView.tsx';
import { ReportsView } from './features/reports/ReportsView.tsx';
import { BranchesView } from './features/branches/BranchesView.tsx';
import { StockTransfersView } from './features/transfers/StockTransfersView.tsx';

const MainLayout: React.FC = () => {
  const { activeModule, activeBranch, consolidatedViewMode } = usePharmacy();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const renderActiveView = () => {
    switch (activeModule) {
      case 'dashboard':
        return <DashboardView />;
      case 'billing':
        return <BillingView />;
      case 'medicines':
        return <MedicinesView />;
      case 'inventory':
        return <InventoryView />;
      case 'customers':
        return <CustomersView />;
      case 'suppliers':
        return <SuppliersView />;
      case 'purchases':
        return <PurchasesView />;
      case 'settings':
        return <SettingsView />;
      case 'employees':
        return <EmployeesView />;
      case 'accounts':
        return <AccountsView />;
      case 'reports':
        return <ReportsView />;
      case 'branches':
        return <BranchesView />;
      case 'transfers':
        return <StockTransfersView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col antialiased text-slate-900">
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Content Viewport Area */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
          {/* Top Header */}
          <TopHeader
            onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            onOpenNotifications={() => setIsNotificationsOpen(true)}
          />

          {/* Main Content View */}
          <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto pb-16">
            {!consolidatedViewMode && activeBranch && activeBranch.status !== 'ACTIVE' && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    {activeBranch.name} ({activeBranch.branchCode}) is {activeBranch.status}
                  </span>
                  <span className="text-amber-800 block mt-0.5">
                    POS billing, inventory inward, expenses, and transfers are locked for this branch. Historical reports and audit logs remain readable.
                  </span>
                </div>
              </div>
            )}
            {renderActiveView()}
          </main>
        </div>
      </div>

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />

      {/* Modals */}
      <StoreOnboardingModal />
      <LoginModal />
      <AddMedicineModal />
      <AddCustomerModal />
      <AddStockModal />
      <PrintInvoiceModal />
    </div>
  );
};

export default function App() {
  return (
    <PharmacyProvider>
      <MainLayout />
    </PharmacyProvider>
  );
}
