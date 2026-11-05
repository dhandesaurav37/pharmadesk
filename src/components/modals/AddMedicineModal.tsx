/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Pill, PlusCircle, CheckCircle2 } from 'lucide-react';
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
  const [success, setSuccess] = useState(false);

  if (activeQuickModal !== 'medicine') return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addMedicine({
      brandName,
      saltComposition,
      manufacturer,
      category,
      schedule,
      rackLocation,
      packSize,
      hsnCode,
      gstSlab,
      prescriptionRequired,
      minStockLevel,
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setActiveQuickModal(null);
    }, 900);
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
              <h3 className="text-sm font-bold text-slate-900">Add Medicine to Master Directory</h3>
              <p className="text-[11px] text-slate-500">Record generic salt, manufacturer & regulatory schedule</p>
            </div>
          </div>

          <button
            onClick={() => setActiveQuickModal(null)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-900">Medicine Master Added</h4>
            <p className="text-xs text-slate-500 mt-1">Available for batch stock inward and POS billing.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Brand Name & Strength *
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
                  Manufacturer *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Micro Labs Ltd"
                  value={manufacturer}
                  onChange={e => setManufacturer(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Salt / Generic Composition *
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dosage Form *
                </label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as MedicineCategory)}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
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
                  Schedule Class *
                </label>
                <select
                  value={schedule}
                  onChange={e => {
                    const sched = e.target.value as ScheduleCategory;
                    setSchedule(sched);
                    setPrescriptionRequired(sched !== 'OTC');
                  }}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                >
                  <option value="OTC">OTC (Over The Counter)</option>
                  <option value="Schedule H">Schedule H (Prescription)</option>
                  <option value="Schedule H1">Schedule H1 (Warning Register)</option>
                  <option value="Schedule X">Schedule X (Narcotic/Special)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pack Size *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 15 Tablets"
                  value={packSize}
                  onChange={e => setPackSize(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rack / Shelf Location *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Rack A-1"
                  value={rackLocation}
                  onChange={e => setRackLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GST Slab (%) *
                </label>
                <select
                  value={gstSlab}
                  onChange={e => setGstSlab(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                >
                  <option value={12}>12% (Standard formulations)</option>
                  <option value={5}>5% (Life-saving & vaccines)</option>
                  <option value={18}>18% (Disinfectants/cosmetics)</option>
                  <option value={0}>0% (Exempt items)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reorder Threshold *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={minStockLevel}
                  onChange={e => setMinStockLevel(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={prescriptionRequired}
                  onChange={e => setPrescriptionRequired(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Doctor Prescription Mandatory (Rx Required)</span>
              </label>
            </div>

            <div className="pt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setActiveQuickModal(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs"
              >
                Add Medicine
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
