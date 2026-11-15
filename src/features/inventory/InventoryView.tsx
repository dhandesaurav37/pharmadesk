/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Boxes,
  Search,
  AlertTriangle,
  Clock,
  Plus,
  ArrowUpDown,
  Edit3,
  CheckCircle2,
  Filter,
  TrendingUp,
  History,
  IndianRupee,
  Calendar,
  Building2,
  X,
  FileSpreadsheet,
  PackageCheck,
  Ban,
  ArrowUpRight,
  ArrowDownRight,
  Check,
  Info,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { InventoryBatch, StockMovement, StockMovementType } from '../../types/pharmacy.ts';

type InventoryTab = 'all' | 'low_stock' | 'expiry' | 'valuation' | 'movements';

export const InventoryView: React.FC = () => {
  const {
    inventory,
    medicines,
    stockMovements,
    expiryWarningDays,
    setExpiryWarningDays,
    adjustBatchStock,
    currentUser,
    store,
    setActiveQuickModal,
  } = usePharmacy();

  const [activeTab, setActiveTab] = useState<InventoryTab>('all');
  const [search, setSearch] = useState('');
  const [batchStatusFilter, setBatchStatusFilter] = useState<string>('all');
  const [selectedBatch, setSelectedBatch] = useState<InventoryBatch | null>(null);

  // Stock Adjustment Modal
  const [adjustingBatch, setAdjustingBatch] = useState<InventoryBatch | null>(null);
  const [adjustType, setAdjustType] = useState<StockMovementType>('MANUAL_ADJUSTMENT');
  const [adjustDelta, setAdjustDelta] = useState<number>(-1);
  const [adjustReason, setAdjustReason] = useState('Physical shelf count variance');
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Movements filter
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');

  const isOwnerOrPharmacist = currentUser.role === 'owner' || currentUser.role === 'pharmacist';
  const isHelper = currentUser.role === 'helper';

  // Counts & Calculations
  const lowStockBatches = useMemo(() => inventory.filter(b => b.status === 'low_stock'), [inventory]);
  const outOfStockBatches = useMemo(() => inventory.filter(b => b.currentStock === 0), [inventory]);

  // Expiry calculation
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const { expiredBatches, nearExpiryBatches, expiryValuation } = useMemo(() => {
    const expired: InventoryBatch[] = [];
    const near: InventoryBatch[] = [];
    let expiredPurchaseVal = 0;
    let expiredMrpVal = 0;
    let nearPurchaseVal = 0;
    let nearMrpVal = 0;

    for (const b of inventory) {
      if (b.currentStock <= 0) continue;

      let expDate: Date;
      if (b.expiryDate.length === 7) {
        const [year, month] = b.expiryDate.split('-').map(Number);
        expDate = new Date(year!, month!, 0);
      } else {
        expDate = new Date(b.expiryDate);
      }

      const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) {
        expired.push(b);
        expiredPurchaseVal += b.currentStock * b.ptr;
        expiredMrpVal += b.currentStock * b.mrp;
      } else if (diffDays <= expiryWarningDays) {
        near.push(b);
        nearPurchaseVal += b.currentStock * b.ptr;
        nearMrpVal += b.currentStock * b.mrp;
      }
    }

    return {
      expiredBatches: expired,
      nearExpiryBatches: near,
      expiryValuation: {
        expiredPurchaseVal,
        expiredMrpVal,
        nearPurchaseVal,
        nearMrpVal,
      },
    };
  }, [inventory, today, expiryWarningDays]);

  // Low Stock Medicines & Reorder Analysis
  const lowStockMedicines = useMemo(() => {
    const stockMap = new Map<string, number>();
    for (const b of inventory) {
      stockMap.set(b.medicineId, (stockMap.get(b.medicineId) || 0) + b.currentStock);
    }

    return medicines
      .filter(m => m.status !== 'archived')
      .map(m => {
        const currentStock = stockMap.get(m.id) || 0;
        const threshold = m.minStockLevel || 15;
        const isLow = currentStock <= threshold;
        const suggestedReorder = isLow ? Math.max(0, threshold * 2 - currentStock) : 0;
        return {
          medicine: m,
          currentStock,
          threshold,
          isLow,
          isOut: currentStock === 0,
          suggestedReorder,
        };
      })
      .filter(item => item.isLow);
  }, [medicines, inventory]);

  // Overall Inventory Valuation
  const valuation = useMemo(() => {
    let totalStockUnits = 0;
    let totalPurchaseCost = 0;
    let totalMrpValue = 0;

    const branchBreakdown: Record<string, { units: number; purchase: number; mrp: number }> = {};
    const medBreakdown: Record<string, { name: string; units: number; purchase: number; mrp: number }> = {};

    for (const b of inventory) {
      if (b.currentStock <= 0) continue;

      const units = b.currentStock;
      const pVal = units * b.ptr;
      const mVal = units * b.mrp;

      totalStockUnits += units;
      totalPurchaseCost += pVal;
      totalMrpValue += mVal;

      const br = b.branchId || store.branchName || 'Main Store';
      branchBreakdown[br] = {
        units: (branchBreakdown[br]?.units || 0) + units,
        purchase: (branchBreakdown[br]?.purchase || 0) + pVal,
        mrp: (branchBreakdown[br]?.mrp || 0) + mVal,
      };

      medBreakdown[b.medicineId] = {
        name: b.brandName,
        units: (medBreakdown[b.medicineId]?.units || 0) + units,
        purchase: (medBreakdown[b.medicineId]?.purchase || 0) + pVal,
        mrp: (medBreakdown[b.medicineId]?.mrp || 0) + mVal,
      };
    }

    const grossMargin = totalMrpValue - totalPurchaseCost;
    const marginPercent = totalMrpValue > 0 ? (grossMargin / totalMrpValue) * 100 : 0;

    return {
      totalStockUnits,
      totalPurchaseCost,
      totalMrpValue,
      grossMargin,
      marginPercent,
      branchBreakdown,
      medBreakdown: Object.values(medBreakdown),
    };
  }, [inventory, store.branchName]);

  // Filtered Batches
  const filteredBatches = useMemo(() => {
    return inventory.filter(b => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        b.brandName.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.saltComposition.toLowerCase().includes(q) ||
        (b.rackLocation && b.rackLocation.toLowerCase().includes(q)) ||
        (b.barcode && b.barcode.toLowerCase().includes(q));

      if (!matchesSearch) return false;
      if (batchStatusFilter === 'all') return true;
      if (batchStatusFilter === 'normal') return b.status === 'normal';
      if (batchStatusFilter === 'low_stock') return b.status === 'low_stock' || b.currentStock <= 10;
      if (batchStatusFilter === 'near_expiry') return b.status === 'near_expiry';
      if (batchStatusFilter === 'expired') return b.status === 'expired';
      if (batchStatusFilter === 'out_of_stock') return b.currentStock === 0;
      return true;
    });
  }, [inventory, search, batchStatusFilter]);

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    return stockMovements.filter(m => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        m.medicineName.toLowerCase().includes(q) ||
        m.batchNumber.toLowerCase().includes(q) ||
        (m.reason && m.reason.toLowerCase().includes(q)) ||
        m.performedBy.toLowerCase().includes(q);

      if (!matchesSearch) return false;
      if (movementTypeFilter === 'all') return true;
      return m.movementType === movementTypeFilter;
    });
  }, [stockMovements, search, movementTypeFilter]);

  // Open Adjust Modal
  const handleOpenAdjust = (batch: InventoryBatch) => {
    setAdjustingBatch(batch);
    setAdjustType('MANUAL_ADJUSTMENT');
    setAdjustDelta(-1);
    setAdjustReason('Physical shelf count variance');
    setAdjustError(null);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingBatch) return;

    if (adjustingBatch.currentStock + adjustDelta < 0) {
      setAdjustError(
        `Negative inventory is prohibited. Current stock is ${adjustingBatch.currentStock}. Adjustment would result in ${
          adjustingBatch.currentStock + adjustDelta
        }.`
      );
      return;
    }

    if (!adjustReason.trim()) {
      setAdjustError('Please record a reason for the adjustment audit trail.');
      return;
    }

    adjustBatchStock(adjustingBatch.id, adjustDelta, adjustType, adjustReason.trim());
    setAdjustingBatch(null);
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Batch-Level Inventory & Expiry Controls
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              {inventory.length} Batches
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time batch-level tracking, immutable stock movements ledger, expiry quarantines and PTR inventory valuation
          </p>
        </div>

        {isOwnerOrPharmacist && (
          <button
            onClick={() => setActiveQuickModal('stock')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Inward Stock Batch</span>
          </button>
        )}
      </div>

      {/* KPI Ribbons */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Total Sellable Units
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">
            {valuation.totalStockUnits.toLocaleString('en-IN')}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Across {inventory.filter(b => b.currentStock > 0).length} active batches
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Stock Valuation (PTR)
          </span>
          <div className="text-2xl font-bold font-mono text-blue-700 mt-1 tabular-nums">
            ₹{valuation.totalPurchaseCost.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            Wholesale purchase investment
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Retail Value (MRP)
          </span>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
            ₹{valuation.totalMrpValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
            +{valuation.marginPercent.toFixed(1)}% gross margin spread
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Expiry & Low Stock Alerts
          </span>
          <div className="text-2xl font-bold font-mono text-amber-600 mt-1 tabular-nums flex items-baseline gap-2">
            {expiredBatches.length + nearExpiryBatches.length}
            <span className="text-xs font-normal text-slate-400">batches</span>
          </div>
          <span className="text-[11px] text-red-600 font-medium mt-0.5 block flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {expiredBatches.length} expired quarantined
          </span>
        </div>
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'all'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Batch Inventory</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-100 font-mono">
            {inventory.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('low_stock')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'low_stock'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span>Low Stock & Reorders</span>
          {lowStockMedicines.length > 0 && (
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 font-mono font-semibold">
              {lowStockMedicines.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('expiry')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'expiry'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="w-4 h-4 text-red-500" />
          <span>Expiry Management</span>
          {expiredBatches.length > 0 && (
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-red-100 text-red-700 font-mono font-semibold">
              {expiredBatches.length} Expired
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('valuation')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'valuation'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <IndianRupee className="w-4 h-4 text-emerald-600" />
          <span>Inventory Valuation</span>
        </button>

        <button
          onClick={() => setActiveTab('movements')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'movements'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <History className="w-4 h-4 text-slate-600" />
          <span>Stock Movement Ledger</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-100 font-mono">
            {stockMovements.length}
          </span>
        </button>
      </div>

      {/* ================= TAB 1: ALL BATCHES ================= */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search batches by brand, batch no, salt or rack..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={batchStatusFilter}
                onChange={e => setBatchStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="normal">Normal Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="near_expiry">Near Expiry</option>
                <option value="expired">Expired</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
          </div>

          {/* Batches Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Medicine & Salt Formulation</th>
                    <th className="px-4 py-3">Batch No</th>
                    <th className="px-4 py-3">Expiry Date</th>
                    <th className="px-4 py-3 text-right">Available Stock</th>
                    <th className="px-4 py-3 text-right">PTR (Cost)</th>
                    <th className="px-4 py-3 text-right">MRP</th>
                    <th className="px-4 py-3">Shelf Rack</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBatches.map(batch => {
                    const isExpired = batch.status === 'expired';
                    const isNearExp = batch.status === 'near_expiry';

                    return (
                      <tr
                        key={batch.id}
                        className={`hover:bg-slate-50/70 transition-colors ${
                          isExpired ? 'bg-red-50/20' : isNearExp ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-900">{batch.brandName}</div>
                          <div className="text-[11px] text-slate-500 font-medium line-clamp-1">
                            {batch.saltComposition}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 font-mono font-bold text-slate-800">
                          {batch.batchNumber}
                        </td>

                        <td className="px-4 py-3.5 font-mono">
                          <span
                            className={
                              isExpired
                                ? 'text-red-700 font-bold'
                                : isNearExp
                                ? 'text-amber-700 font-semibold'
                                : 'text-slate-700'
                            }
                          >
                            {batch.expiryDate}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900 tabular-nums">
                          {batch.currentStock}
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono text-slate-600 tabular-nums">
                          ₹{batch.ptr.toFixed(2)}
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          ₹{batch.mrp.toFixed(2)}
                        </td>

                        <td className="px-4 py-3.5 text-slate-600">
                          {batch.rackLocation || '—'}
                        </td>

                        <td className="px-4 py-3.5">
                          {batch.currentStock === 0 && (
                            <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                              Out of Stock
                            </span>
                          )}
                          {isExpired && (
                            <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Ban className="w-3 h-3" /> Quarantined
                            </span>
                          )}
                          {isNearExp && (
                            <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Near Expiry
                            </span>
                          )}
                          {batch.status === 'low_stock' && (
                            <span className="text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                              Low Stock
                            </span>
                          )}
                          {batch.status === 'normal' && (
                            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                              Normal
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setSelectedBatch(batch)}
                              className="px-2.5 py-1 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 cursor-pointer"
                            >
                              Details
                            </button>
                            {isOwnerOrPharmacist && (
                              <button
                                onClick={() => handleOpenAdjust(batch)}
                                className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-lg border border-slate-200 flex items-center gap-1 cursor-pointer"
                                title="Adjust Stock Quantity"
                              >
                                <Edit3 className="w-3 h-3" /> Adjust
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredBatches.length === 0 && (
              <div className="text-center py-12 p-6">
                <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-800">No inventory batches match criteria</h3>
                <p className="text-xs text-slate-500 mt-1">Try clearing your search filter or inward a new batch.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 2: LOW STOCK & REORDERS ================= */}
      {activeTab === 'low_stock' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <p className="font-semibold">Reorder Recommendation Formula</p>
              <p className="mt-0.5 text-amber-800">
                Medicines whose cumulative batch stock falls below their minimum safety threshold (configured in Master Catalogue)
                are flagged here. Recommended order quantities aim to replenish stock to 2× safety buffer level.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lowStockMedicines.map(({ medicine, currentStock, threshold, isOut, suggestedReorder }) => (
              <div
                key={medicine.id}
                className={`bg-white rounded-2xl border p-5 flex flex-col justify-between shadow-xs ${
                  isOut ? 'border-red-200 bg-red-50/20' : 'border-amber-200'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{medicine.brandName}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{medicine.saltComposition}</p>
                    </div>
                    {isOut ? (
                      <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full shrink-0">
                        OUT OF STOCK
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full shrink-0">
                        LOW STOCK
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-slate-400 block uppercase">Current Balance</span>
                      <span className={`text-base font-mono font-bold mt-0.5 block ${isOut ? 'text-red-600' : 'text-amber-600'}`}>
                        {currentStock} {medicine.uom || 'units'}
                      </span>
                    </div>

                    <div className="p-2.5 bg-slate-50 rounded-xl">
                      <span className="text-[10px] text-slate-400 block uppercase">Safety Min Level</span>
                      <span className="text-base font-mono font-bold text-slate-800 mt-0.5 block">
                        {threshold} {medicine.uom || 'units'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-between text-xs">
                    <span className="text-blue-900 font-medium">Suggested Reorder:</span>
                    <span className="font-mono font-bold text-blue-700 text-sm">
                      +{suggestedReorder} {medicine.uom || 'units'}
                    </span>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-400 text-[11px] truncate">{medicine.manufacturer}</span>
                  <button
                    onClick={() => setActiveQuickModal('stock')}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer shrink-0"
                  >
                    + Inward Stock
                  </button>
                </div>
              </div>
            ))}
          </div>

          {lowStockMedicines.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <PackageCheck className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-slate-800">All medicines have healthy stock balances</h3>
              <p className="text-xs text-slate-500 mt-1">No formulations are currently below their minimum safety threshold.</p>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 3: EXPIRY MANAGEMENT ================= */}
      {activeTab === 'expiry' && (
        <div className="space-y-5">
          {/* Controls & Warning Period Selector */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Configurable Warning Threshold
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Flag batches approaching expiration for stockist credit note returns before statutory expiry
              </p>
            </div>

            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
              {[30, 60, 90].map(days => (
                <button
                  key={days}
                  onClick={() => setExpiryWarningDays(days)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                    expiryWarningDays === days
                      ? 'bg-white text-blue-600 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {days} Days
                </button>
              ))}
            </div>
          </div>

          {/* Expired Stock Quarantine Section */}
          <div className="bg-white rounded-2xl border border-red-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-red-50 border-b border-red-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-red-900 font-bold text-sm">
                <Ban className="w-4 h-4 text-red-600" />
                <span>Expired Stock Quarantine ({expiredBatches.length} Batches)</span>
              </div>
              <span className="text-xs font-semibold text-red-800 font-mono">
                Valuation at Risk: ₹{expiryValuation.expiredPurchaseVal.toFixed(2)} PTR / ₹{expiryValuation.expiredMrpVal.toFixed(2)} MRP
              </span>
            </div>

            <div className="p-4 bg-red-50/40 text-xs text-red-800 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>
                <strong>Statutory Drug Law Compliance:</strong> Expired drugs are strictly blocked from POS sale dispensing.
                Process a purchase return to distributor or record an authorized expiry write-off adjustment.
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {expiredBatches.map(b => (
                <div key={b.id} className="p-4 flex items-center justify-between hover:bg-slate-50 text-xs">
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{b.brandName}</span>
                    <span className="text-slate-500 font-mono text-[11px]">Batch: {b.batchNumber} · Exp: {b.expiryDate}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-red-700 font-mono text-sm block">{b.currentStock} units</span>
                    <span className="text-[11px] text-slate-400 font-mono">Cost ₹{(b.currentStock * b.ptr).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {expiredBatches.length === 0 && (
                <p className="p-8 text-center text-xs text-slate-400 italic">No expired batches currently in store inventory.</p>
              )}
            </div>
          </div>

          {/* Near-Expiry Section */}
          <div className="bg-white rounded-2xl border border-amber-200 shadow-xs overflow-hidden">
            <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Clock className="w-4 h-4 text-amber-600" />
                <span>Near-Expiry Batches (Expiring within {expiryWarningDays} Days)</span>
              </div>
              <span className="text-xs font-semibold text-amber-800 font-mono">
                Valuation: ₹{expiryValuation.nearPurchaseVal.toFixed(2)} PTR / ₹{expiryValuation.nearMrpVal.toFixed(2)} MRP
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {nearExpiryBatches.map(b => (
                <div key={b.id} className="p-4 flex items-center justify-between hover:bg-slate-50 text-xs">
                  <div>
                    <span className="font-bold text-slate-900 text-sm block">{b.brandName}</span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      Batch: {b.batchNumber} · Shelf: {b.rackLocation || 'A-1'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-amber-700 font-mono text-sm block">{b.currentStock} units</span>
                    <span className="text-[11px] text-slate-500 font-mono">Expires: {b.expiryDate}</span>
                  </div>
                </div>
              ))}
              {nearExpiryBatches.length === 0 && (
                <p className="p-8 text-center text-xs text-slate-400 italic">No batches expiring within the next {expiryWarningDays} days.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 4: INVENTORY VALUATION ================= */}
      {activeTab === 'valuation' && (
        <div className="space-y-5">
          {/* Valuation Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Total Purchase Cost (PTR)
              </span>
              <div className="text-3xl font-bold font-mono text-blue-700 mt-2">
                ₹{valuation.totalPurchaseCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Authoritative cost of goods capital tied up in stock</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Total Retail Value (MRP)
              </span>
              <div className="text-3xl font-bold font-mono text-emerald-700 mt-2">
                ₹{valuation.totalMrpValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-slate-500 mt-1">Expected retail realization before point-of-sale discounts</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                Projected Gross Margin
              </span>
              <div className="text-3xl font-bold font-mono text-slate-900 mt-2">
                ₹{valuation.grossMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <span className="inline-block mt-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                {valuation.marginPercent.toFixed(1)}% Gross Spread
              </span>
            </div>
          </div>

          {/* Medicine-wise Valuation Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Medicine-Wise Valuation Breakdown</h3>
              <span className="text-xs text-slate-500">{valuation.medBreakdown.length} Active Formulations</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Medicine Formulation</th>
                    <th className="px-4 py-3 text-right">Stock Units</th>
                    <th className="px-4 py-3 text-right">Purchase Value (PTR)</th>
                    <th className="px-4 py-3 text-right">Retail Value (MRP)</th>
                    <th className="px-5 py-3 text-right">Estimated Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {valuation.medBreakdown.map((item, idx) => {
                    const margin = item.mrp - item.purchase;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="px-5 py-3.5 font-bold text-slate-900">{item.name}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-semibold tabular-nums">
                          {item.units}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-blue-700 tabular-nums">
                          ₹{item.purchase.toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono text-emerald-700 font-semibold tabular-nums">
                          ₹{item.mrp.toFixed(2)}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono text-slate-700 tabular-nums">
                          ₹{margin.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= TAB 5: STOCK MOVEMENTS LEDGER ================= */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search ledger by medicine, batch, reason, user..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={movementTypeFilter}
              onChange={e => setMovementTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shrink-0"
            >
              <option value="all">All Movement Types</option>
              <option value="OPENING_STOCK">Opening Stock</option>
              <option value="PURCHASE_RECEIPT">Purchase Receipt</option>
              <option value="SALE">POS Sale</option>
              <option value="SALE_RETURN">Sale Return</option>
              <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
              <option value="DAMAGE">Damage</option>
              <option value="EXPIRY">Expiry Write-off</option>
            </select>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-4 py-3">Movement Type</th>
                    <th className="px-4 py-3">Medicine & Batch</th>
                    <th className="px-4 py-3 text-right">Quantity Delta</th>
                    <th className="px-4 py-3 text-right">Stock (Prev → New)</th>
                    <th className="px-4 py-3">Reason / Reference</th>
                    <th className="px-5 py-3 text-right">Performed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.map(m => {
                    const isPositive = m.quantityChange > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(m.timestamp).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>

                        <td className="px-4 py-3.5">
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              m.movementType === 'OPENING_STOCK'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : m.movementType === 'SALE'
                                ? 'bg-slate-100 text-slate-800'
                                : m.movementType === 'DAMAGE' || m.movementType === 'EXPIRY'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {m.movementType.replace(/_/g, ' ')}
                          </span>
                        </td>

                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900">{m.medicineName}</div>
                          <div className="text-[11px] text-slate-500 font-mono">{m.batchNumber}</div>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono font-bold text-sm tabular-nums">
                          <span className={isPositive ? 'text-emerald-600' : 'text-red-600'}>
                            {isPositive ? `+${m.quantityChange}` : m.quantityChange}
                          </span>
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono text-slate-600 tabular-nums">
                          {m.previousQuantity} → <strong className="text-slate-900">{m.newQuantity}</strong>
                        </td>

                        <td className="px-4 py-3.5 text-slate-600 max-w-xs truncate">
                          {m.reason || m.referenceType || '—'}
                        </td>

                        <td className="px-5 py-3.5 text-right text-slate-600">
                          {m.performedBy}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredMovements.length === 0 && (
              <div className="text-center py-10 p-6 text-xs text-slate-400">
                No stock movements logged matching filter.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: STOCK ADJUSTMENT ================= */}
      {adjustingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Adjust Batch Stock</h3>
                  <p className="text-[11px] text-slate-500">{adjustingBatch.brandName} ({adjustingBatch.batchNumber})</p>
                </div>
              </div>
              <button
                onClick={() => setAdjustingBatch(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {adjustError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{adjustError}</span>
              </div>
            )}

            <form onSubmit={handleSaveAdjustment} className="space-y-3.5 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl flex items-center justify-between">
                <span className="text-slate-500">Current Stock Balance:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {adjustingBatch.currentStock} units
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Adjustment Type</label>
                <select
                  value={adjustType}
                  onChange={e => setAdjustType(e.target.value as StockMovementType)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                >
                  <option value="MANUAL_ADJUSTMENT">Manual Adjustment (Count variance)</option>
                  <option value="DAMAGE">Physical Damage / Breakage</option>
                  <option value="EXPIRY">Expiry Write-Off</option>
                  <option value="SALE_RETURN">Sale Return Inward</option>
                  <option value="PURCHASE_RETURN">Return to Stockist</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Quantity Delta (Negative to deduct, Positive to add)
                </label>
                <input
                  type="number"
                  required
                  value={adjustDelta}
                  onChange={e => setAdjustDelta(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono text-sm"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  New balance will be: <strong>{adjustingBatch.currentStock + adjustDelta} units</strong>
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Reason for Audit Trail <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Physical stock count discrepancy, water leakage"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustingBatch(null)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  Commit Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: BATCH DETAILS DRAWER ================= */}
      {selectedBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-mono uppercase text-slate-400">Batch Specification</span>
                <h3 className="text-base font-bold text-slate-900">{selectedBatch.brandName}</h3>
                <p className="text-xs text-slate-500">{selectedBatch.saltComposition}</p>
              </div>
              <button
                onClick={() => setSelectedBatch(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Batch Number</span>
                <span className="font-mono font-bold text-slate-800 text-sm">{selectedBatch.batchNumber}</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Expiry Date</span>
                <span className="font-mono font-bold text-slate-800 text-sm">{selectedBatch.expiryDate}</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Available Units</span>
                <span className="font-mono font-bold text-slate-900 text-sm">{selectedBatch.currentStock}</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Wholesale PTR Rate</span>
                <span className="font-mono font-bold text-blue-700 text-sm">₹{selectedBatch.ptr.toFixed(2)}</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Maximum Retail Price</span>
                <span className="font-mono font-bold text-emerald-700 text-sm">₹{selectedBatch.mrp.toFixed(2)}</span>
              </div>

              <div className="p-2.5 bg-slate-50 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase block font-semibold">Shelf Rack</span>
                <span className="font-semibold text-slate-800 text-sm">{selectedBatch.rackLocation || 'Rack A-1'}</span>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Branch Assignment:</span>
                <span className="font-semibold text-slate-800">{selectedBatch.branchId || store.branchName || 'Main Store'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Batch Inward Date:</span>
                <span className="font-mono text-slate-600">
                  {selectedBatch.createdAt ? new Date(selectedBatch.createdAt).toLocaleDateString('en-IN') : '01 Mar 2026'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedBatch(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
