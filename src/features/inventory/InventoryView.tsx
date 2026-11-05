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
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { InventoryBatch } from '../../types/pharmacy.ts';

type FilterTab = 'all' | 'low_stock' | 'near_expiry' | 'out_of_stock';

export const InventoryView: React.FC = () => {
  const { inventory, updateBatchStock, setActiveQuickModal } = usePharmacy();

  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [editingBatch, setEditingBatch] = useState<InventoryBatch | null>(null);
  const [adjustedStock, setAdjustedStock] = useState<number>(0);

  const lowStockCount = inventory.filter(b => b.status === 'low_stock').length;
  const nearExpiryCount = inventory.filter(b => b.status === 'near_expiry').length;
  const outOfStockCount = inventory.filter(b => b.currentStock === 0).length;

  const filteredBatches = useMemo(() => {
    return inventory.filter(b => {
      const q = search.toLowerCase();
      const matchesSearch =
        b.brandName.toLowerCase().includes(q) ||
        b.batchNumber.toLowerCase().includes(q) ||
        b.saltComposition.toLowerCase().includes(q) ||
        b.rackLocation.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (activeTab === 'low_stock') return b.status === 'low_stock';
      if (activeTab === 'near_expiry') return b.status === 'near_expiry';
      if (activeTab === 'out_of_stock') return b.currentStock === 0;
      return true;
    });
  }, [inventory, search, activeTab]);

  const handleOpenStockAdjust = (batch: InventoryBatch) => {
    setEditingBatch(batch);
    setAdjustedStock(batch.currentStock);
  };

  const handleSaveStockAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBatch) return;
    updateBatchStock(editingBatch.id, adjustedStock);
    setEditingBatch(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Inventory & Batch Management
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              {inventory.length} Active Batches
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time batch-level tracking, expiry controls, PTR margins and reorder alerts
          </p>
        </div>

        <button
          onClick={() => setActiveQuickModal('stock')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Stock Batch</span>
        </button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Interactive Segmented Filter Controls */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'all'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Batches ({inventory.length})
          </button>

          <button
            onClick={() => setActiveTab('low_stock')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'low_stock'
                ? 'bg-amber-500 text-white shadow-xs font-bold'
                : 'text-amber-700 hover:text-amber-800'
            }`}
          >
            Low Stock ({lowStockCount})
          </button>

          <button
            onClick={() => setActiveTab('near_expiry')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'near_expiry'
                ? 'bg-red-600 text-white shadow-xs font-bold'
                : 'text-red-700 hover:text-red-800'
            }`}
          >
            Near Expiry ({nearExpiryCount})
          </button>

          <button
            onClick={() => setActiveTab('out_of_stock')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'out_of_stock'
                ? 'bg-slate-700 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Out of Stock ({outOfStockCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search batch #, medicine, or rack..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
          />
        </div>
      </div>

      {/* Batches Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredBatches.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Boxes className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-semibold text-slate-700">No batches match criteria</h3>
            <p className="text-xs text-slate-500 mt-1">
              Clear your search filter or add a new inward stock batch.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Medicine & Formulation</th>
                  <th className="py-3 px-4 font-mono">Batch No</th>
                  <th className="py-3 px-4 font-mono">Expiry</th>
                  <th className="py-3 px-4 text-right font-mono">Stock Units</th>
                  <th className="py-3 px-4 text-right font-mono">PTR (₹)</th>
                  <th className="py-3 px-4 text-right font-mono">MRP (₹)</th>
                  <th className="py-3 px-4 text-center font-mono">Margin %</th>
                  <th className="py-3 px-4">Rack Location</th>
                  <th className="py-3 px-4">Batch Status</th>
                  <th className="py-3 px-4 text-center">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBatches.map(batch => {
                  const marginPercent = ((batch.mrp - batch.ptr) / batch.mrp) * 100;
                  const isLow = batch.status === 'low_stock';
                  const isExp = batch.status === 'near_expiry';
                  const isExpired = batch.status === 'expired';

                  return (
                    <tr key={batch.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">
                          {batch.brandName}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-xs">
                          {batch.saltComposition}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-mono font-semibold text-blue-600">
                        {batch.batchNumber}
                      </td>

                      <td className="py-3 px-4 font-mono">
                        <div className={`font-semibold ${isExp || isExpired ? 'text-red-600' : 'text-slate-700'}`}>
                          {batch.expiryDate}
                        </div>
                        {isExp && (
                          <span className="text-[9px] text-red-600 font-bold uppercase block">
                            Near Expiry
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold text-sm ${
                            batch.currentStock === 0
                              ? 'text-slate-400'
                              : isLow
                              ? 'text-amber-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {batch.currentStock}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {batch.packSize}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                        ₹{batch.ptr.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900">
                        ₹{batch.mrp.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-semibold text-emerald-700">
                        {marginPercent.toFixed(1)}%
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        {batch.rackLocation}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                            batch.currentStock === 0
                              ? 'bg-slate-200 text-slate-700'
                              : isExp
                              ? 'bg-red-100 text-red-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {batch.currentStock === 0 ? 'Out of Stock' : batch.status.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleOpenStockAdjust(batch)}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Audit / Adjust Stock Count"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {editingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Audit Stock Adjustment
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  Batch: {editingBatch.batchNumber}
                </p>
              </div>
              <button
                onClick={() => setEditingBatch(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStockAdjust} className="p-5 space-y-4">
              <div>
                <span className="text-xs font-semibold text-slate-800 block">
                  {editingBatch.brandName}
                </span>
                <span className="text-[11px] text-slate-500">
                  Pack size: {editingBatch.packSize} • Current count: {editingBatch.currentStock}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Verified Physical Count (Units) *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustedStock}
                  onChange={e => setAdjustedStock(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
                >
                  Save Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
