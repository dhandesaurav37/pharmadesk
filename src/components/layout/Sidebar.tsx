/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  Pill,
  Boxes,
  Users,
  Truck,
  ShoppingBag,
  Landmark,
  UserCheck,
  BarChart3,
  Settings,
  ChevronRight,
  ShieldCheck,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { NavigationModule, UserRole } from '../../types/pharmacy.ts';

interface NavItem {
  id: NavigationModule;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: UserRole[];
  badge?: (counts: { lowStockCount: number; nearExpiryCount: number }) => number | null;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, allowedRoles: ['owner', 'pharmacist', 'cashier'] },
  { id: 'billing', label: 'Billing (POS)', icon: Receipt, allowedRoles: ['owner', 'pharmacist', 'cashier'] },
  { id: 'medicines', label: 'Medicines Master', icon: Pill, allowedRoles: ['owner', 'pharmacist'] },
  {
    id: 'inventory',
    label: 'Inventory & Batches',
    icon: Boxes,
    allowedRoles: ['owner', 'pharmacist'],
    badge: ({ lowStockCount, nearExpiryCount }) => (lowStockCount + nearExpiryCount > 0 ? lowStockCount + nearExpiryCount : null),
  },
  { id: 'customers', label: 'Customers & Khata', icon: Users, allowedRoles: ['owner', 'pharmacist', 'cashier'] },
  { id: 'suppliers', label: 'Suppliers & Stockists', icon: Truck, allowedRoles: ['owner', 'pharmacist'] },
  { id: 'purchases', label: 'Purchases (Inward)', icon: ShoppingBag, allowedRoles: ['owner', 'pharmacist'] },
  { id: 'accounts', label: 'Accounts & Cash', icon: Landmark, allowedRoles: ['owner'] },
  { id: 'employees', label: 'Staff & Roles', icon: UserCheck, allowedRoles: ['owner'] },
  { id: 'reports', label: 'Reports & GST', icon: BarChart3, allowedRoles: ['owner', 'pharmacist'] },
  { id: 'settings', label: 'Store Settings', icon: Settings, allowedRoles: ['owner'] },
];

interface SidebarProps {
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpenMobile, onCloseMobile }) => {
  const {
    activeModule,
    setActiveModule,
    currentUser,
    switchUserRole,
    inventory,
    store,
    setIsStoreOnboardingOpen,
  } = usePharmacy();

  const lowStockCount = inventory.filter(b => b.status === 'low_stock').length;
  const nearExpiryCount = inventory.filter(b => b.status === 'near_expiry').length;

  const handleNavClick = (mod: NavigationModule) => {
    setActiveModule(mod);
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
                Pharmacy Platform
              </span>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        {/* Current Active Pharmacy Banner */}
        <div className="px-4 py-3 bg-slate-950/60 border-b border-slate-800/80">
          <div className="flex items-center justify-between">
            <div className="min-w-0 pr-2">
              <span className="text-xs font-semibold text-slate-200 block truncate">
                {store.name}
              </span>
              <span className="text-[11px] text-slate-400 block truncate">
                {store.branchName}
              </span>
            </div>
            <button
              onClick={() => setIsStoreOnboardingOpen(true)}
              className="text-[11px] text-blue-400 hover:text-blue-300 font-medium whitespace-nowrap shrink-0 hover:underline"
              title="Store Details & Setup Wizard"
            >
              Info
            </button>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Navigation
          </div>

          {NAV_ITEMS.map(item => {
            const isAllowed = item.allowedRoles.includes(currentUser.role);
            const isActive = activeModule === item.id;
            const badgeVal = item.badge ? item.badge({ lowStockCount, nearExpiryCount }) : null;

            if (!isAllowed) {
              return null; // Restricted by role
            }

            const Icon = item.icon;

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
                    className={`text-xs px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold tabular-nums shrink-0 ${
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
        </div>

        {/* Role Switcher & User Profile Footprint */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/70">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-400">Current Role:</span>
            <span className="font-semibold text-blue-400 capitalize">
              {currentUser.role === 'owner' ? 'Store Owner' : currentUser.role}
            </span>
          </div>

          {/* Quick Role Tester Pills for Phase 4 RBAC testing */}
          <div className="grid grid-cols-5 gap-0.5 p-1 bg-slate-900 rounded-lg text-[10px] font-medium border border-slate-800 mb-3">
            <button
              onClick={() => switchUserRole('owner')}
              className={`py-1 rounded text-center transition-colors cursor-pointer ${
                currentUser.role === 'owner' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
              title="Store Owner (Superuser)"
            >
              Owner
            </button>
            <button
              onClick={() => switchUserRole('pharmacist')}
              className={`py-1 rounded text-center transition-colors cursor-pointer ${
                currentUser.role === 'pharmacist' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
              title="Registered Pharmacist"
            >
              Pharm
            </button>
            <button
              onClick={() => switchUserRole('cashier')}
              className={`py-1 rounded text-center transition-colors cursor-pointer ${
                currentUser.role === 'cashier' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
              title="Billing Cashier"
            >
              Cashier
            </button>
            <button
              onClick={() => switchUserRole('helper')}
              className={`py-1 rounded text-center transition-colors cursor-pointer ${
                currentUser.role === 'helper' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
              title="Stock Helper / Boy"
            >
              Helper
            </button>
            <button
              onClick={() => switchUserRole('auditor')}
              className={`py-1 rounded text-center transition-colors cursor-pointer ${
                currentUser.role === 'auditor' ? 'bg-blue-600 text-white font-semibold' : 'text-slate-400 hover:text-white'
              }`}
              title="Tax & Audit Compliance"
            >
              Audit
            </button>
          </div>

          <div className="flex items-center gap-2.5 pt-1">
            <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-semibold text-xs text-white shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold text-slate-200 block truncate">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                DL: {store.dlNumber20B}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
