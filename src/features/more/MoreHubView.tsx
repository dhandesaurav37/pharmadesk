/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  BarChart3,
  Landmark,
  UserCheck,
  GitBranch,
  ArrowLeftRight,
  Settings,
  History,
  HardDriveDownload,
  ChevronRight,
  CheckCircle2,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { getVisibleSecondaryItems } from '../../lib/operatorHelpers.ts';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  reports: BarChart3,
  accounts: Landmark,
  employees: UserCheck,
  branches: GitBranch,
  transfers: ArrowLeftRight,
  settings: Settings,
  audit_history: History,
  data_export: HardDriveDownload,
};

export const MoreHubView: React.FC = () => {
  const {
    currentUser,
    hasUserPermission,
    navigateToModule,
    store,
    branches,
    usersList,
  } = usePharmacy();

  const items = getVisibleSecondaryItems(currentUser.role, hasUserPermission);
  const isOwner = currentUser.role === 'owner';

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            More Store Tools
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Reports, accounts, staff access, branch tools, and store settings available for your role
          </p>
        </div>
        <div className="text-xs text-slate-600 font-medium">
          Role:{' '}
          <span className="font-semibold text-slate-900 capitalize">
            {currentUser.role === 'owner' ? 'Store Owner' : currentUser.role}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-white p-10 rounded-xl border border-slate-200 text-center space-y-2">
          <h2 className="text-sm font-bold text-slate-900">No Extra Tools Required</h2>
          <p className="text-xs text-slate-500">
            Your counter workspace already includes all tools enabled for your role.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => {
            const Icon = ICON_MAP[item.id] || Settings;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigateToModule(item.module, item.subTab ?? null)}
                className="bg-white p-5 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/20 text-left transition-colors flex items-start justify-between gap-3 group"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-100 group-hover:bg-blue-50 text-slate-700 group-hover:text-blue-700 flex items-center justify-center shrink-0 transition-colors">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                      {item.label}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 shrink-0 mt-1" />
              </button>
            );
          })}
        </div>
      )}

      {isOwner && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Store Plan & Active Capacity
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {store.name} · {branches.length} active branch(es) · {usersList.length} team member(s) · Region: India (Mumbai)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigateToModule('settings', 'store')}
            className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
          >
            Manage Store Profile
          </button>
        </div>
      )}
    </div>
  );
};
