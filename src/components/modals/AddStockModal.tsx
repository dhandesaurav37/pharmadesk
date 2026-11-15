/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, Boxes, CheckCircle2, AlertTriangle } from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { isBatchExpired } from '../../lib/operatorHelpers.ts';

export const AddStockModal: React.FC = () => {
  const { activeQuickModal, setActiveQuickModal, medicines, addInventoryBatch } = usePharmacy();

  const [selectedMedId, setSelectedMedId] = useState(medicines[0]?.id || '');
  const [batchNumber, setBatchNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('2028-06');
  const [packSize, setPackSize] = useState('10 Tablets');
  const [mrp, setMrp] = useState<number | ''>(120);
  const [ptr, setPtr] = useState<number | ''>(90);
  const [quantity, setQuantity] = useState<number | ''>(30);
  const [rackLocation, setRackLocation] = useState('Rack A-1');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (activeQuickModal !== 'stock') return null;

  const currentMed = medicines.find(m => m.id === selectedMedId) || medicines[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!currentMed) {
      setError('Select a medicine first.');
      return;
    }
    if (!batchNumber.trim()) {
      setError('Enter the Batch Number printed on the medicine strip/box.');
      return;
    }
    if (!expiryDate || isBatchExpired(expiryDate)) {
      setError('Cannot add stock that is already expired. Check the expiry month.');
      return;
    }
    if (!quantity || Number(quantity) <= 0 || !mrp || Number(mrp) <= 0 || !ptr || Number(ptr) <= 0) {
      setError('Quantity, MRP, and Purchase Rate must be greater than zero.');
      return;
    }

    addInventoryBatch({
      medicineId: currentMed.id,
      brandName: currentMed.brandName,
      saltComposition: currentMed.saltComposition,
      batchNumber: batchNumber.toUpperCase().trim(),
      expiryDate,
      packSize: packSize || currentMed.packSize,
      mrp: Number(mrp),
      ptr: Number(ptr),
      currentStock: Number(quantity),
      rackLocation: rackLocation || currentMed.rackLocation,
    });

    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setBatchNumber('');
      setActiveQuickModal(null);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add Stock</h3>
              <p className="text-[11px] text-slate-500">Quick batch &amp; expiry entry ready for counter billing</p>
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
            <h4 className="text-base font-bold text-slate-900">Stock Added</h4>
            <p className="text-xs text-slate-500 mt-1">Batch is now available in stock and billing.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Medicine *
              </label>
              <select
                value={selectedMedId}
                onChange={e => {
                  setSelectedMedId(e.target.value);
                  const m = medicines.find(med => med.id === e.target.value);
                  if (m) {
                    setPackSize(m.packSize);
                    setRackLocation(m.rackLocation);
                  }
                }}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              >
                {medicines.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.brandName} ({m.saltComposition}) - {m.packSize}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batch Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DL-9821"
                  value={batchNumber}
                  onChange={e => setBatchNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expiry Date (YYYY-MM) *
                </label>
                <input
                  type="month"
                  required
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  MRP (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  required
                  value={mrp}
                  onChange={e => setMrp(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PTR / Purchase (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  required
                  value={ptr}
                  onChange={e => setPtr(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quantity (Packs) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pack Unit / Size
                </label>
                <input
                  type="text"
                  value={packSize}
                  onChange={e => setPackSize(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rack / Shelf Location
                </label>
                <input
                  type="text"
                  value={rackLocation}
                  onChange={e => setRackLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
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
                Add Stock Batch
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
