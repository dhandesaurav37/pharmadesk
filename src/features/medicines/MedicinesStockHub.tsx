/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pill,
  Boxes,
  AlertTriangle,
  Clock,
  Ban,
  History,
  IndianRupee,
  Plus,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { MedicinesView } from './MedicinesView.tsx';
import { InventoryView } from '../inventory/InventoryView.tsx';
import { getDaysToExpiry, isBatchExpired } from '../../lib/operatorHelpers.ts';

export type MedicinesStockTab =
  | 'medicines'
  | 'stock'
  | 'low_stock'
  | 'expiry'
  | 'expired'
  | 'movements'
  | 'valuation';

interface MedicinesStockHubProps {
  defaultTab?: MedicinesStockTab;
}

export const MedicinesStockHub: React.FC<MedicinesStockHubProps> = ({
  defaultTab = 'medicines',
}) => {
  const {
    medicines,
    inventory,
    expiryWarningDays,
    hasUserPermission,
    setActiveQuickModal,
    moduleSubTab,
    setModuleSubTab,
    navigateToModule,
  } = usePharmacy();

  const [tab, setTab] = useState<MedicinesStockTab>(defaultTab);

  const canManageCatalog =
    hasUserPermission('medicines.create') || hasUserPermission('medicines.update');
  const canAddStock = hasUserPermission('inventory.inward');
  const canReceiveStock = hasUserPermission('goods_receipts.post');
  const canViewMargin = hasUserPermission('inventory.ptr_margin');

  // Sync deep link sub-tab from Home/Alerts/Sidebar
  useEffect(() => {
    if (!moduleSubTab) return;
    const valid: MedicinesStockTab[] = [
      'medicines',
      'stock',
      'low_stock',
      'expiry',
      'expired',
      'movements',
      'valuation',
    ];
    if (valid.includes(moduleSubTab as MedicinesStockTab)) {
      const next = moduleSubTab as MedicinesStockTab;
      if (next === 'valuation' && !canViewMargin) {
        setTab('stock');
      } else {
        setTab(next);
      }
      setModuleSubTab(null);
    }
  }, [moduleSubTab, setModuleSubTab, canViewMargin]);

  const counts = useMemo(() => {
    const activeMeds = medicines.filter(m => m.status !== 'archived');
    const stockByMed = new Map<string, number>();
    let availableBatches = 0;
    let expiredCount = 0;
    let nearExpiryCount = 0;

    for (const batch of inventory) {
      if (batch.currentStock <= 0) continue;
      if (isBatchExpired(batch.expiryDate)) {
        expiredCount += 1;
        continue;
      }
      availableBatches += 1;
      stockByMed.set(
        batch.medicineId,
        (stockByMed.get(batch.medicineId) || 0) + batch.currentStock
      );
      const days = getDaysToExpiry(batch.expiryDate);
      if (days !== null && days >= 0 && days <= expiryWarningDays) {
        nearExpiryCount += 1;
      }
    }

    let lowStockCount = 0;
    for (const m of activeMeds) {
      const qty = stockByMed.get(m.id) || 0;
      if (qty <= (m.minStockLevel || 15)) {
        lowStockCount += 1;
      }
    }

    return {
      medicines: activeMeds.length,
      availableBatches,
      lowStockCount,
      nearExpiryCount,
      expiredCount,
    };
  }, [medicines, inventory, expiryWarningDays]);

  const tabs: Array<{
    id: MedicinesStockTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    badgeTone?: 'amber' | 'red' | 'neutral';
    visible?: boolean;
  }> = [
    {
      id: 'medicines',
      label: 'Medicines',
      icon: <Pill className="w-3.5 h-3.5" />,
      badge: counts.medicines,
      badgeTone: 'neutral',
      visible: true,
    },
    {
      id: 'stock',
      label: 'Available Stock',
      icon: <Boxes className="w-3.5 h-3.5" />,
      badge: counts.availableBatches,
      badgeTone: 'neutral',
      visible: true,
    },
    {
      id: 'low_stock',
      label: 'Low Stock',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />,
      badge: counts.lowStockCount || undefined,
      badgeTone: 'amber',
      visible: true,
    },
    {
      id: 'expiry',
      label: 'Near Expiry',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
      badge: counts.nearExpiryCount || undefined,
      badgeTone: 'amber',
      visible: true,
    },
    {
      id: 'expired',
      label: 'Expired Stock',
      icon: <Ban className="w-3.5 h-3.5 text-red-600" />,
      badge: counts.expiredCount || undefined,
      badgeTone: 'red',
      visible: true,
    },
    {
      id: 'movements',
      label: 'Stock History',
      icon: <History className="w-3.5 h-3.5" />,
      visible: true,
    },
    {
      id: 'valuation',
      label: 'Check Stock & Value',
      icon: <IndianRupee className="w-3.5 h-3.5 text-emerald-600" />,
      visible: canViewMargin,
    },
  ];

  const mappedInventoryTab =
    tab === 'low_stock'
      ? 'low_stock'
      : tab === 'expiry' || tab === 'expired'
      ? 'expiry'
      : tab === 'movements'
      ? 'movements'
      : tab === 'valuation'
      ? 'valuation'
      : 'all';

  const mappedExpiryMode = tab === 'expired' ? 'expired' : tab === 'expiry' ? 'near' : 'all';

  return (
    <div className="space-y-4">
      {/* Unified Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            Medicines &amp; Stock
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Find medicines, check rack availability, manage low stock, and keep expired packs out of billing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canManageCatalog && (
            <button
              type="button"
              onClick={() => setActiveQuickModal('medicine')}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Medicine</span>
            </button>
          )}
          {canReceiveStock ? (
            <button
              type="button"
              onClick={() => navigateToModule('purchases', 'receive')}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Receive Stock</span>
            </button>
          ) : canAddStock ? (
            <button
              type="button"
              onClick={() => setActiveQuickModal('stock')}
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Stock</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Unified Sub-navigation */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 sm:px-4 flex items-center gap-1.5 overflow-x-auto">
        {tabs
          .filter(item => item.visible)
          .map(item => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`px-3 py-3 text-xs font-semibold border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
                      item.badgeTone === 'red'
                        ? 'bg-red-100 text-red-700'
                        : item.badgeTone === 'amber'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
      </div>

      {/* Active Pane */}
      {tab === 'medicines' ? (
        <MedicinesView embedded />
      ) : (
        <InventoryView
          embedded
          controlledTab={mappedInventoryTab}
          expiryFocusMode={mappedExpiryMode}
          onChangeControlledTab={nextTab => {
            if (nextTab === 'all') setTab('stock');
            else if (nextTab === 'low_stock') setTab('low_stock');
            else if (nextTab === 'expiry') setTab('expiry');
            else if (nextTab === 'movements') setTab('movements');
            else if (nextTab === 'valuation') setTab('valuation');
          }}
        />
      )}
    </div>
  );
};
