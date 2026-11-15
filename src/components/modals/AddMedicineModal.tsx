/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Pill, CheckCircle2, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { MedicineCategory, ScheduleCategory } from '../../types/pharmacy.ts';

export const AddMedicineModal: React.FC = () => {
  const { activeQuickModal, setActiveQuickModal, addMedicine } = usePharmacy();

  const [brandName, setBrandName] = useState('');
  const [saltComposition, setSaltComposition] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [category, setCategory] = useState<MedicineCategory>('Tablet');
  const [schedule, setSchedule] = useState<ScheduleCategory>('Schedule H');
  const [rackLocation, setRackLocation] = useState('Rack A-1');
  const [packSize, setPackSize] = useState('10 Tablets');
  const [hsnCode, setHsnCode] = useState('300490');
  const [gstSlab, setGstSlab] = useState(12);
  const [prescriptionRequired, setPrescriptionRequired] = useState(true);
  const [minStockLevel, setMinStockLevel] = useState(15);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (activeQuickModal !== 'medicine') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!brandName.trim() || !saltComposition.trim()) {
      setError('Enter both Medicine Name and Salt Name to continue.');
      return;
    }

    addMedicine({
      brandName: brandName.trim(),
      saltComposition: saltComposition.trim(),
      manufacturer: manufacturer.trim() || 'Standard Pharma',
      category,
      schedule,
      rackLocation: rackLocation.trim() || 'Rack A-1',
      packSize: packSize.trim() || '10 Tablets',
      hsnCode: hsnCode.trim() || '300490',
      gstSlab,
      prescriptionRequired,
      minStockLevel: Math.max(1, Number(minStockLevel) || 15),
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setBrandName('');
      setSaltComposition('');
      setManufacturer('');
      setActiveQuickModal(null);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Pill className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add Medicine</h3>
              <p className="text-[11px] text-slate-500">Save a medicine with sensible GST &amp; alert defaults</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveQuickModal(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-900">Medicine Saved</h4>
            <p className="text-xs text-slate-500 mt-1">Ready for stock entry and billing.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Medicine Name &amp; Strength *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dolo 650 Tablet"
                  value={brandName}
                  onChange={e => setBrandName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Salt / Generic Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Paracetamol (650mg)"
                  value={saltComposition}
                  onChange={e => setSaltComposition(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  placeholder="e.g. Micro Labs"
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pack Size
                </label>
                <input
                  type="text"
                  placeholder="e.g. 15 Tablets"
                  value={packSize}
                  onChange={e => setPackSize(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Shelf Rack
                </label>
                <input
                  type="text"
                  placeholder="Rack A-1"
                  value={rackLocation}
                  onChange={e => setRackLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMore(v => !v)}
              className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              {showMore ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{showMore ? 'Hide GST & Prescription Options' : 'More Tax, Schedule & Alert Options'}</span>
            </button>

            {showMore && (
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Form
                    </label>
                    <select
                      value={category}
                      onChange={e => setCategory(e.target.value as MedicineCategory)}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="Tablet">Tablet</option>
                      <option value="Capsule">Capsule</option>
                      <option value="Syrup">Syrup</option>
                      <option value="Injection">Injection</option>
                      <option value="Ointment">Ointment</option>
                      <option value="Drops">Drops</option>
                      <option value="Inhaler">Inhaler</option>
                      <option value="Powder">Powder</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Schedule Type
                    </label>
                    <select
                      value={schedule}
                      onChange={e => {
                        const sched = e.target.value as ScheduleCategory;
                        setSchedule(sched);
                        setPrescriptionRequired(sched !== 'OTC');
                      }}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="OTC">OTC (No Rx needed)</option>
                      <option value="Schedule H">Schedule H (Rx)</option>
                      <option value="Schedule H1">Schedule H1 (Register)</option>
                      <option value="Schedule X">Schedule X (Special)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      GST Rate (%)
                    </label>
                    <select
                      value={gstSlab}
                      onChange={e => setGstSlab(Number(e.target.value))}
                      className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value={12}>12% (Standard)</option>
                      <option value={5}>5% (Essential)</option>
                      <option value={18}>18%</option>
                      <option value={0}>0% (Exempt)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      HSN Code
                    </label>
                    <input
                      type="text"
                      value={hsnCode}
                      onChange={e => setHsnCode(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Low Stock Alert Below
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={minStockLevel}
                      onChange={e => setMinStockLevel(Number(e.target.value))}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={prescriptionRequired}
                    onChange={e => setPrescriptionRequired(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Ask for Doctor Name when billing</span>
                </label>
              </div>
            )}

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActiveQuickModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
              >
                Save Medicine
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
