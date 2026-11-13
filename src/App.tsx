/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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

const MainLayout: React.FC = () => {
  const { activeModule, currentUser } = usePharmacy();
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
