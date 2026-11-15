/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Lock, ArrowLeft } from 'lucide-react';
import { PharmacyProvider, usePharmacy } from './context/PharmacyContext.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { TopHeader } from './components/layout/TopHeader.tsx';
import { NotificationsDrawer } from './components/layout/NotificationsDrawer.tsx';

import { MobileBottomNav } from './components/layout/MobileBottomNav.tsx';

// Modals
import { StoreOnboardingModal } from './components/modals/StoreOnboardingModal.tsx';
import { LoginModal } from './components/modals/LoginModal.tsx';
import { AddMedicineModal } from './components/modals/AddMedicineModal.tsx';
import { AddCustomerModal } from './components/modals/AddCustomerModal.tsx';
import { AddStockModal } from './components/modals/AddStockModal.tsx';
import { PrintInvoiceModal } from './components/modals/PrintInvoiceModal.tsx';

// Code-split authenticated workspace views (keeps initial marketing & POS load light)
const DashboardView = lazy(() =>
  import('./features/dashboard/DashboardView.tsx').then((m) => ({ default: m.DashboardView }))
);
const BillingView = lazy(() =>
  import('./features/billing/BillingView.tsx').then((m) => ({ default: m.BillingView }))
);
const MedicinesStockHub = lazy(() =>
  import('./features/medicines/MedicinesStockHub.tsx').then((m) => ({
    default: m.MedicinesStockHub,
  }))
);
const CustomersView = lazy(() =>
  import('./features/customers/CustomersView.tsx').then((m) => ({ default: m.CustomersView }))
);
const PurchasesView = lazy(() =>
  import('./features/purchases/PurchasesView.tsx').then((m) => ({ default: m.PurchasesView }))
);
const MoreHubView = lazy(() =>
  import('./features/more/MoreHubView.tsx').then((m) => ({ default: m.MoreHubView }))
);
const SettingsView = lazy(() =>
  import('./features/settings/SettingsView.tsx').then((m) => ({ default: m.SettingsView }))
);
const EmployeesView = lazy(() =>
  import('./features/employees/EmployeesView.tsx').then((m) => ({ default: m.EmployeesView }))
);
const AccountsView = lazy(() =>
  import('./features/accounts/AccountsView.tsx').then((m) => ({ default: m.AccountsView }))
);
const ReportsView = lazy(() =>
  import('./features/reports/ReportsView.tsx').then((m) => ({ default: m.ReportsView }))
);
const BranchesView = lazy(() =>
  import('./features/branches/BranchesView.tsx').then((m) => ({ default: m.BranchesView }))
);
const StockTransfersView = lazy(() =>
  import('./features/transfers/StockTransfersView.tsx').then((m) => ({
    default: m.StockTransfersView,
  }))
);

// Marketing Website Shell & Pages
import { MarketingHeader } from './components/marketing/MarketingHeader.tsx';
import { MarketingFooter } from './components/marketing/MarketingFooter.tsx';
import { MarketingRoutePath, usePageSeo } from './lib/seo.ts';
import type { PublicInquiryType } from './lib/publicLeadApi.ts';

const HomePage = lazy(() =>
  import('./pages/marketing/HomePage.tsx').then((m) => ({ default: m.HomePage }))
);
const FeaturesPage = lazy(() =>
  import('./pages/marketing/FeaturesPage.tsx').then((m) => ({ default: m.FeaturesPage }))
);
const PricingPage = lazy(() =>
  import('./pages/marketing/PricingPage.tsx').then((m) => ({ default: m.PricingPage }))
);
const AboutPage = lazy(() =>
  import('./pages/marketing/AboutPage.tsx').then((m) => ({ default: m.AboutPage }))
);
const ContactPage = lazy(() =>
  import('./pages/marketing/ContactPage.tsx').then((m) => ({ default: m.ContactPage }))
);
const LegalPage = lazy(() =>
  import('./pages/marketing/LegalPage.tsx').then((m) => ({ default: m.LegalPage }))
);

function normalizeRoutePath(pathname: string): MarketingRoutePath {
  const clean = pathname.replace(/\/+$/, '') || '/';
  switch (clean) {
    case '/':
      return '/';
    case '/features':
      return '/features';
    case '/pricing':
      return '/pricing';
    case '/about':
      return '/about';
    case '/contact':
      return '/contact';
    case '/privacy':
      return '/privacy';
    case '/terms':
      return '/terms';
    case '/app':
      return '/app';
    default:
      return '/';
  }
}

const MainLayout: React.FC<{ onReturnToSite: () => void }> = ({ onReturnToSite }) => {
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
        return <MedicinesStockHub defaultTab="medicines" />;
      case 'inventory':
        return <MedicinesStockHub defaultTab="stock" />;
      case 'customers':
        return <CustomersView />;
      case 'suppliers':
        return <PurchasesView initialTab="suppliers" />;
      case 'purchases':
        return <PurchasesView />;
      case 'more':
        return <MoreHubView />;
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
            onReturnToSite={onReturnToSite}
          />

          {/* Main Content View */}
          <main className="flex-1 p-4 lg:p-6 max-w-7xl w-full mx-auto pb-24 lg:pb-12">
            {!consolidatedViewMode && activeBranch && activeBranch.status !== 'ACTIVE' && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">
                    {activeBranch.name} ({activeBranch.branchCode}) is {activeBranch.status}
                  </span>
                  <span className="text-amber-800 block mt-0.5">
                    POS billing, inventory inward, expenses, and transfers are locked for this
                    branch. Historical reports and audit logs remain readable.
                  </span>
                </div>
              </div>
            )}
            <Suspense
              fallback={
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-xs text-slate-500">
                  Loading workspace...
                </div>
              }
            >
              {renderActiveView()}
            </Suspense>
          </main>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
      />

      {/* Workspace Modals */}
      <StoreOnboardingModal />
      <AddMedicineModal />
      <AddCustomerModal />
      <AddStockModal />
      <PrintInvoiceModal />
    </div>
  );
};

const AppShell: React.FC = () => {
  const { firebaseSession, setIsLoginModalOpen } = usePharmacy();
  const [route, setRoute] = useState<MarketingRoutePath>(() =>
    typeof window !== 'undefined' ? normalizeRoutePath(window.location.pathname) : '/'
  );
  const [contactInquiryType, setContactInquiryType] = useState<PublicInquiryType>('BOOK_DEMO');

  usePageSeo(route);

  useEffect(() => {
    const onPopState = () => {
      setRoute(normalizeRoutePath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateTo = useCallback(
    (nextRoute: MarketingRoutePath, inquiryType?: PublicInquiryType) => {
      if (inquiryType) {
        setContactInquiryType(inquiryType);
      }
      if (typeof window !== 'undefined') {
        const targetPath = nextRoute === '/' ? '/' : nextRoute;
        if (window.location.pathname !== targetPath) {
          window.history.pushState({}, '', targetPath);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setRoute(nextRoute);
    },
    []
  );

  const handleStartTrial = useCallback(() => {
    if (route === '/') {
      const el = document.getElementById('enquiry-form');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    navigateTo('/contact', 'FREE_TRIAL');
  }, [navigateTo, route]);

  const handleBookDemo = useCallback(() => {
    navigateTo('/contact', 'BOOK_DEMO');
  }, [navigateTo]);

  const renderMarketingPage = () => {
    switch (route) {
      case '/features':
        return <FeaturesPage onNavigate={navigateTo} />;
      case '/pricing':
        return <PricingPage onNavigate={navigateTo} />;
      case '/about':
        return <AboutPage onNavigate={navigateTo} />;
      case '/contact':
        return <ContactPage defaultInquiryType={contactInquiryType} />;
      case '/privacy':
        return <LegalPage mode="privacy" onNavigate={navigateTo} />;
      case '/terms':
        return <LegalPage mode="terms" onNavigate={navigateTo} />;
      case '/':
      default:
        return <HomePage onNavigate={navigateTo} />;
    }
  };

  const isProdWorkspaceLocked =
    route === '/app' && import.meta.env.PROD && !firebaseSession.authenticated;

  return (
    <>
      {route === '/app' ? (
        isProdWorkspaceLocked ? (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5 text-center shadow-xs">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h1 className="text-xl font-bold text-slate-900">
                  Sign In to PharmaDesk Workspace
                </h1>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  Staff authentication via Firebase Authentication is required to access your
                  pharmacy&apos;s billing, stock, and accounting workspace.
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsLoginModalOpen(true)}
                  className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
                >
                  Open Staff Sign In
                </button>
                <button
                  type="button"
                  onClick={() => navigateTo('/')}
                  className="w-full py-2 px-4 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Public Website</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <MainLayout onReturnToSite={() => navigateTo('/')} />
        )
      ) : (
        <div className="min-h-screen bg-white text-slate-900 flex flex-col antialiased">
          <MarketingHeader
            currentRoute={route}
            onNavigate={(r) => navigateTo(r)}
            onOpenLogin={() => setIsLoginModalOpen(true)}
            onStartTrial={handleStartTrial}
            isAuthenticated={firebaseSession.authenticated}
            onOpenWorkspace={() => navigateTo('/app')}
          />

          <main className="flex-1">
            <Suspense
              fallback={
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-sm text-slate-500">
                  Loading PharmaDesk...
                </div>
              }
            >
              {renderMarketingPage()}
            </Suspense>
          </main>

          <MarketingFooter
            onNavigate={(r) => navigateTo(r)}
            onBookDemo={handleBookDemo}
            onOpenLogin={() => setIsLoginModalOpen(true)}
          />
        </div>
      )}

      {/* Root-mounted LoginModal accessible from both public marketing site and /app workspace */}
      <LoginModal onEnterWorkspace={() => navigateTo('/app')} />
    </>
  );
};

export default function App() {
  return (
    <PharmacyProvider>
      <AppShell />
    </PharmacyProvider>
  );
}
