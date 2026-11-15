/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Home,
  Receipt,
  Package,
  ShoppingBag,
  Users,
  Grid,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  getVisiblePrimaryDestinations,
  isBatchExpired,
  PrimaryDestinationId,
} from '../../lib/operatorHelpers.ts';

const NAV_ICONS: Record<PrimaryDestinationId, React.ComponentType<{ className?: string }>> = {
  dashboard: Home,
  billing: Receipt,
  medicines: Package,
  purchases: ShoppingBag,
  customers: Users,
  more: Grid,
};

interface SidebarProps {
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile, onCloseMobile }) => {
  const {
    activeModule,
    navigateToModule,
    currentUser,
    switchUserRole,
    inventory,
    medicines,
    store,
    activeBranch,
    consolidatedViewMode,
    setIsStoreOnboardingOpen,
    firebaseSession,
  } = usePharmacy();

  const visibleDestinations = getVisiblePrimaryDestinations(currentUser.role);

  // Live stock & expiry attention count for Medicines & Stock badge
  const lowStockMedCount = (() => {
    const stockByMed = new Map<string, number>();
    for (const b of inventory) {
      if (!isBatchExpired(b.expiryDate)) {
        stockByMed.set(b.medicineId, (stockByMed.get(b.medicineId) || 0) + b.currentStock);
      }
    }
    return medicines.filter(
      m => m.status !== 'archived' && (stockByMed.get(m.id) || 0) <= (m.minStockLevel || 15)
    ).length;
  })();

  const nearOrExpiredCount = inventory.filter(
    b => b.currentStock > 0 && (b.status === 'near_expiry' || b.status === 'expired' || isBatchExpired(b.expiryDate))
  ).length;
  const stockAttentionBadge = lowStockMedCount + nearOrExpiredCount;

  const handleNavClick = (id: PrimaryDestinationId) => {
    navigateToModule(id, null);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              <span className="leading-none">P</span>
              <span className="text-blue-200 text-xs leading-none">+</span>
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-white block leading-tight">
                PharmaDesk
              </span>
              <span className="text-[11px] font-medium text-slate-400 block leading-none">
                Store Workspace
              </span>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close navigation menu"
          >
            ✕
          </button>
        </div>

        {/* Active Pharmacy Store Banner */}
        <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/80">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-200 block truncate">
                {store.name}
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                {consolidatedViewMode
                  ? 'All Branches'
                  : `${activeBranch?.name || store.branchName} · ${activeBranch?.branchCode || 'MAIN'}`}
              </span>
            </div>
            {currentUser.role === 'owner' && (
              <button
                onClick={() => setIsStoreOnboardingOpen(true)}
                className="text-[11px] text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap shrink-0 hover:underline"
              >
                Setup
              </button>
            )}
          </div>
        </div>

        {/* 5 Primary Operator Destinations + More */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1" aria-label="Primary Workspace Navigation">
          {visibleDestinations.map(item => {
            const isActive = item.matchesModules.includes(activeModule);
            const Icon = NAV_ICONS[item.id];
            const badgeVal = item.id === 'medicines' && stockAttentionBadge > 0 ? stockAttentionBadge : null;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>

                {badgeVal !== null && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-mono font-semibold tabular-nums shrink-0 ${
                      isActive
                        ? 'bg-blue-700 text-blue-100'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {badgeVal}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer: Dev Preview Role Switcher (Hidden in Production / Live Auth) + Staff Profile */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/70">
          {!import.meta.env.PROD && !firebaseSession.authenticated && (
            <div className="mb-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Preview Role:</span>
                <span className="font-semibold text-blue-400 capitalize">
                  {currentUser.role === 'owner' ? 'Store Owner' : currentUser.role}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-0.5 p-1 bg-slate-900 rounded-lg text-[10px] font-medium border border-slate-800">
                {(['owner', 'pharmacist', 'cashier', 'helper', 'auditor'] as const).map(role => (
                  <button
                    key={role}
                    onClick={() => switchUserRole(role)}
                    className={`py-1 rounded text-center transition-colors cursor-pointer capitalize ${
                      currentUser.role === role
                        ? 'bg-blue-600 text-white font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {role === 'pharmacist' ? 'Pharm' : role === 'auditor' ? 'Audit' : role}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-semibold text-xs text-white shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-slate-200 block truncate">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-slate-400 block truncate capitalize">
                {currentUser.role === 'owner' ? 'Store Owner' : currentUser.role}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
