/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Bell,
  ChevronDown,
  Building2,
  Plus,
  Receipt,
  User,
  ShieldCheck,
  Sparkles,
  LogOut,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';

interface TopHeaderProps {
  onToggleMobileMenu: () => void;
  onOpenNotifications: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onToggleMobileMenu,
  onOpenNotifications,
}) => {
  const {
    store,
    currentUser,
    switchUserRole,
    usersList,
    setActiveModule,
    notifications,
    setIsStoreOnboardingOpen,
    setIsLoginModalOpen,
  } = usePharmacy();

  const [isStoreMenuOpen, setIsStoreMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const storeMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (storeMenuRef.current && !storeMenuRef.current.contains(e.target as Node)) {
        setIsStoreMenuOpen(false);
      }
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-30 flex items-center justify-between px-4 lg:px-6">
      {/* Left side: Hamburger (mobile) + Store Selector */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:outline-hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Store Selector Dropdown */}
        <div className="relative" ref={storeMenuRef}>
          <button
            onClick={() => setIsStoreMenuOpen(!isStoreMenuOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-slate-50/80 hover:bg-slate-100/80 text-left transition-colors focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
          >
            <div className="w-7 h-7 rounded-md bg-blue-50 border border-blue-200 text-blue-700 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="hidden sm:block text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-900 truncate max-w-[140px] sm:max-w-[200px]">
                  {store.name}
                </span>
                <span className="text-[10px] bg-slate-200/80 text-slate-700 px-1.5 py-0.2 rounded font-medium">
                  {store.branchName.split(' ')[0]}
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block">
                GSTIN: {store.gstin.slice(0, 10)}...
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          </button>

          {isStoreMenuOpen && (
            <div className="absolute left-0 mt-1.5 w-72 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3 pb-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Select Active Pharmacy
                </span>
              </div>
              <div className="py-1">
                <button
                  onClick={() => setIsStoreMenuOpen(false)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-start justify-between"
                >
                  <div>
                    <span className="text-xs font-semibold text-blue-700 block">
                      {store.name}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {store.branchName} • DL: {store.dlNumber20B}
                    </span>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                </button>
              </div>

              <div className="pt-2 px-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    setIsStoreMenuOpen(false);
                    setIsStoreOnboardingOpen(true);
                  }}
                  className="w-full py-1.5 px-3 rounded-lg text-xs font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-dashed border-blue-300 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Configure Store / Onboard New Branch</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Demo Data indicator */}
        <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200/80 rounded-md text-[11px] text-amber-800">
          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>Demo Environment • Verified Sample Data</span>
        </div>
      </div>

      {/* Right side: Quick Bill Action + Notifications + Profile */}
      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* Quick New Bill CTA */}
        <button
          onClick={() => setActiveModule('billing')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors focus:ring-2 focus:ring-blue-500/20"
          title="Open POS Terminal (Shortcut: F2)"
        >
          <Receipt className="w-3.5 h-3.5" />
          <span>New Bill</span>
          <span className="hidden sm:inline-block text-[10px] bg-blue-700/80 text-blue-100 px-1 rounded font-mono">
            F2
          </span>
        </button>

        {/* Notifications Icon with Badge */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-colors"
          aria-label="View notifications"
          title="Alerts and Reminders"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-600 ring-2 ring-white" />
          )}
        </button>

        {/* User Profile Menu */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 text-left transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-semibold text-xs shrink-0">
              {currentUser.name.charAt(0)}
            </div>
            <div className="hidden md:block text-left">
              <span className="text-xs font-semibold text-slate-800 block leading-tight truncate max-w-[120px]">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-slate-500 capitalize block leading-tight">
                {currentUser.role === 'owner' ? 'Pharmacy Owner' : currentUser.role}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
          </button>

          {isProfileMenuOpen && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
              <div className="px-4 py-2 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-900 block truncate">
                  {currentUser.name}
                </span>
                <span className="text-[11px] text-slate-500 block truncate">
                  {currentUser.email}
                </span>
                <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded w-fit capitalize">
                  <ShieldCheck className="w-3 h-3 text-blue-600" />
                  <span>Role: {currentUser.role}</span>
                </div>
              </div>

              {/* Role Switcher in Profile */}
              <div className="px-4 py-2 border-b border-slate-100">
                <span className="text-[11px] font-medium text-slate-500 block mb-1">
                  Switch Active Role (Demo):
                </span>
                <div className="space-y-1">
                  {usersList.map(u => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUserRole(u.role);
                        setIsProfileMenuOpen(false);
                      }}
                      className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between ${
                        currentUser.role === u.role
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="capitalize">{u.role}: {u.name}</span>
                      {currentUser.role === u.role && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    setIsLoginModalOpen(true);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Staff Authentication / Sign In</span>
                </button>
                <button
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    setIsStoreOnboardingOpen(true);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                >
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>Store Onboarding Wizard</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
