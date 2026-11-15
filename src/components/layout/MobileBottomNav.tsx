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
  PrimaryDestinationId,
} from '../../lib/operatorHelpers.ts';

const MOBILE_ICONS: Record<PrimaryDestinationId, React.ComponentType<{ className?: string }>> = {
  dashboard: Home,
  billing: Receipt,
  medicines: Package,
  purchases: ShoppingBag,
  customers: Users,
  more: Grid,
};

export const MobileBottomNav: React.FC = () => {
  const { activeModule, navigateToModule, currentUser } = usePharmacy();
  const items = getVisiblePrimaryDestinations(currentUser.role);

  return (
    <nav
      aria-label="Mobile quick navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-slate-200 px-1 py-1 flex items-center justify-around shadow-sm"
    >
      {items.map(item => {
        const Icon = MOBILE_ICONS[item.id];
        const isActive = item.matchesModules.includes(activeModule);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => navigateToModule(item.id, null)}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-1.5 px-1 rounded-lg text-[10px] font-semibold transition-colors ${
              isActive
                ? 'text-blue-700 bg-blue-50'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="w-4 h-4 mb-0.5 shrink-0" />
            <span className="truncate max-w-full">{item.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
};
