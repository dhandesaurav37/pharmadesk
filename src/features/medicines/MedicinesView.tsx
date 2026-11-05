/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Pill,
  Search,
  Filter,
  Plus,
  Boxes,
  MapPin,
  ChevronRight,
  Info,
  ShieldAlert,
  Building,
  CheckCircle2,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { MedicineCategory, ScheduleCategory, MedicineMaster } from '../../types/pharmacy.ts';

export const MedicinesView: React.FC = () => {
  const { medicines, inventory, setActiveQuickModal } = usePharmacy();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSchedule, setSelectedSchedule] = useState<string>('all');
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineMaster | null>(null);

  const filteredMedicines = useMemo(() => {
    return medicines.filter(med => {
      const matchesSearch =
        med.brandName.toLowerCase().includes(search.toLowerCase()) ||
        med.saltComposition.toLowerCase().includes(search.toLowerCase()) ||
        med.manufacturer.toLowerCase().includes(search.toLowerCase());

      const matchesCat =
        selectedCategory === 'all' || med.category === selectedCategory;

      const matchesSchedule =
        selectedSchedule === 'all' || med.schedule === selectedSchedule;

      return matchesSearch && matchesCat && matchesSchedule;
    });
  }, [medicines, search, selectedCategory, selectedSchedule]);

  // Find batches for selected medicine
  const selectedBatches = useMemo(() => {
    if (!selectedMedicine) return [];
    return inventory.filter(b => b.medicineId === selectedMedicine.id);
  }, [selectedMedicine, inventory]);

  const totalStockForMed = (medId: string) => {
    return inventory
      .filter(b => b.medicineId === medId)
      .reduce((sum, b) => sum + b.currentStock, 0);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Medicines Master Directory
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              {medicines.length} Formulations
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standard drug database with salt compositions, manufacturers, and schedule classes
          </p>
        </div>

        <button
          onClick={() => setActiveQuickModal('medicine')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Medicine</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by brand name, salt composition, or manufacturer..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 bg-white"
          >
            <option value="all">All Dosage Forms</option>
            <option value="Tablet">Tablets</option>
            <option value="Capsule">Capsules</option>
            <option value="Syrup">Syrups</option>
            <option value="Injection">Injections</option>
            <option value="Ointment">Ointments</option>
            <option value="Powder">Powders</option>
          </select>

          {/* Schedule Filter */}
          <select
            value={selectedSchedule}
            onChange={e => setSelectedSchedule(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 bg-white"
          >
            <option value="all">All Schedules</option>
            <option value="OTC">OTC Only</option>
            <option value="Schedule H">Schedule H (Rx)</option>
            <option value="Schedule H1">Schedule H1 (Controlled)</option>
            <option value="Schedule X">Schedule X</option>
          </select>

          {(search || selectedCategory !== 'all' || selectedSchedule !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
                setSelectedSchedule('all');
              }}
              className="text-xs text-blue-600 hover:underline px-2 py-1"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredMedicines.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Pill className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <h3 className="text-sm font-semibold text-slate-700">No medicines match filter</h3>
            <p className="text-xs text-slate-500 mt-1">
              Try adjusting your search terms or add a new medicine formulation.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Brand & Form</th>
                  <th className="py-3 px-4">Salt / Generic Composition</th>
                  <th className="py-3 px-4">Manufacturer</th>
                  <th className="py-3 px-4">Schedule Class</th>
                  <th className="py-3 px-4">Rack Location</th>
                  <th className="py-3 px-4 text-center font-mono">GST %</th>
                  <th className="py-3 px-4 text-right font-mono">Stock Units</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMedicines.map(med => {
                  const stock = totalStockForMed(med.id);
                  const isLow = stock <= med.minStockLevel;

                  return (
                    <tr
                      key={med.id}
                      className="hover:bg-slate-50/60 transition-colors group cursor-pointer"
                      onClick={() => setSelectedMedicine(med)}
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {med.brandName}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{med.category}</span>
                          <span>·</span>
                          <span>{med.packSize}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="text-slate-700 block max-w-xs truncate" title={med.saltComposition}>
                          {med.saltComposition}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          HSN: {med.hsnCode}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-600">
                        {med.manufacturer}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                            med.schedule === 'Schedule H1'
                              ? 'bg-red-100 text-red-800'
                              : med.schedule === 'Schedule H'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {med.schedule}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{med.rackLocation}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center font-mono font-medium text-slate-700">
                        {med.gstSlab}%
                      </td>

                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        <span
                          className={`font-bold ${
                            isLow ? 'text-amber-600' : 'text-slate-900'
                          }`}
                        >
                          {stock}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          min: {med.minStockLevel}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMedicine(med);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Batches →
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

      {/* Selected Medicine Batches Drawer / Modal */}
      {selectedMedicine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedMedicine.brandName}
                </h3>
                <p className="text-xs text-slate-500">{selectedMedicine.saltComposition}</p>
              </div>
              <button
                onClick={() => setSelectedMedicine(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Manufacturer</span>
                  <span className="font-semibold text-slate-800">{selectedMedicine.manufacturer}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Schedule</span>
                  <span className="font-semibold text-slate-800">{selectedMedicine.schedule}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Location</span>
                  <span className="font-semibold text-slate-800">{selectedMedicine.rackLocation}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                  Active Inward Batches ({selectedBatches.length})
                </h4>

                {selectedBatches.length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-xs text-slate-500">
                    No active stock batches found for this formulation.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {selectedBatches.map(b => (
                      <div
                        key={b.id}
                        className="p-3 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900">
                              Batch: {b.batchNumber}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Exp: {b.expiryDate}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            PTR: ₹{b.ptr.toFixed(2)} | MRP: ₹{b.mrp.toFixed(2)}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900 block">
                            {b.currentStock} {b.packSize}
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase ${
                              b.status === 'low_stock'
                                ? 'text-amber-600'
                                : b.status === 'near_expiry'
                                ? 'text-red-600'
                                : 'text-emerald-600'
                            }`}
                          >
                            {b.status.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setSelectedMedicine(null);
                    setActiveQuickModal('stock');
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  + Inward New Batch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
