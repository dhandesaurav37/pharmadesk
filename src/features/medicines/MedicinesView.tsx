/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Pill,
  Search,
  Plus,
  Boxes,
  MapPin,
  ChevronRight,
  Info,
  ShieldAlert,
  Building,
  CheckCircle2,
  Barcode,
  Edit3,
  Archive,
  RefreshCw,
  X,
  AlertTriangle,
  FileText,
  Clock,
  Sparkles,
  ArrowRight,
  Check,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { MedicineCategory, ScheduleCategory, MedicineMaster, InventoryBatch } from '../../types/pharmacy.ts';

const CATEGORIES: MedicineCategory[] = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Ointment',
  'Drops',
  'Inhaler',
  'Powder',
  'Surgical',
];

const SCHEDULES: ScheduleCategory[] = [
  'OTC',
  'Schedule H',
  'Schedule H1',
  'Schedule X',
  'Narcotic',
];

export const MedicinesView: React.FC = () => {
  const {
    medicines,
    inventory,
    currentUser,
    addMedicine,
    updateMedicine,
    archiveMedicine,
    setActiveQuickModal,
  } = usePharmacy();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSchedule, setSelectedSchedule] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineMaster | null>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Add / Edit Modal State
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingMed, setEditingMed] = useState<MedicineMaster | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [formBrandName, setFormBrandName] = useState('');
  const [formGenericName, setFormGenericName] = useState('');
  const [formManufacturer, setFormManufacturer] = useState('');
  const [formCategory, setFormCategory] = useState<MedicineCategory>('Tablet');
  const [formDosageForm, setFormDosageForm] = useState('tablet');
  const [formStrength, setFormStrength] = useState('500 mg');
  const [formSchedule, setFormSchedule] = useState<ScheduleCategory>('Schedule H');
  const [formPackSize, setFormPackSize] = useState('10 Tablets');
  const [formUom, setFormUom] = useState('strip');
  const [formRackLocation, setFormRackLocation] = useState('Rack A-1');
  const [formHsnCode, setFormHsnCode] = useState('300490');
  const [formGstSlab, setFormGstSlab] = useState(12);
  const [formBarcode, setFormBarcode] = useState('');
  const [formPrescriptionRequired, setFormPrescriptionRequired] = useState(true);
  const [formMinStockLevel, setFormMinStockLevel] = useState(15);
  const [formDescription, setFormDescription] = useState('');

  // Confirmation Modal State for Archiving
  const [archivingMed, setArchivingMed] = useState<MedicineMaster | null>(null);

  const isOwnerOrPharmacist = currentUser.role === 'owner' || currentUser.role === 'pharmacist';

  const filteredMedicines = useMemo(() => {
    return medicines.filter(med => {
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        med.brandName.toLowerCase().includes(q) ||
        med.saltComposition.toLowerCase().includes(q) ||
        med.manufacturer.toLowerCase().includes(q) ||
        (med.barcode && med.barcode.toLowerCase().includes(q)) ||
        (med.strength && med.strength.toLowerCase().includes(q));

      const matchesCat = selectedCategory === 'all' || med.category === selectedCategory;
      const matchesSchedule = selectedSchedule === 'all' || med.schedule === selectedSchedule;
      const matchesStatus =
        selectedStatus === 'all'
          ? (med.status || 'active') !== 'archived'
          : (med.status || 'active') === selectedStatus;

      return matchesSearch && matchesCat && matchesSchedule && matchesStatus;
    });
  }, [medicines, search, selectedCategory, selectedSchedule, selectedStatus]);

  const totalPages = Math.ceil(filteredMedicines.length / pageSize) || 1;
  const paginatedMedicines = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredMedicines.slice(start, start + pageSize);
  }, [filteredMedicines, page, pageSize]);

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

  const handleOpenAdd = () => {
    setEditingMed(null);
    setFormBrandName('');
    setFormGenericName('');
    setFormManufacturer('');
    setFormCategory('Tablet');
    setFormDosageForm('tablet');
    setFormStrength('500 mg');
    setFormSchedule('Schedule H');
    setFormPackSize('10 Tablets');
    setFormUom('strip');
    setFormRackLocation('Rack A-1');
    setFormHsnCode('300490');
    setFormGstSlab(12);
    setFormBarcode('');
    setFormPrescriptionRequired(true);
    setFormMinStockLevel(15);
    setFormDescription('');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (med: MedicineMaster) => {
    setEditingMed(med);
    setFormBrandName(med.brandName);
    setFormGenericName(med.saltComposition);
    setFormManufacturer(med.manufacturer);
    setFormCategory(med.category);
    setFormDosageForm(med.dosageForm || 'tablet');
    setFormStrength(med.strength || '');
    setFormSchedule(med.schedule);
    setFormPackSize(med.packSize);
    setFormUom(med.uom || 'strip');
    setFormRackLocation(med.rackLocation);
    setFormHsnCode(med.hsnCode);
    setFormGstSlab(med.gstSlab);
    setFormBarcode(med.barcode || '');
    setFormPrescriptionRequired(med.prescriptionRequired);
    setFormMinStockLevel(med.minStockLevel);
    setFormDescription(med.description || '');
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedName = formBrandName.trim();
    const trimmedGeneric = formGenericName.trim();
    const trimmedMfr = formManufacturer.trim();
    const trimmedBarcode = formBarcode.trim() || undefined;

    if (!trimmedName || !trimmedGeneric || !trimmedMfr) {
      setFormError('Brand name, salt composition, and manufacturer are required.');
      return;
    }

    // Duplicate check
    const isDuplicate = medicines.some(
      m =>
        (!editingMed || m.id !== editingMed.id) &&
        m.status !== 'archived' &&
        m.brandName.toLowerCase() === trimmedName.toLowerCase() &&
        (m.strength || '').toLowerCase() === formStrength.trim().toLowerCase() &&
        (m.dosageForm || m.category).toLowerCase() === formDosageForm.trim().toLowerCase()
    );

    if (isDuplicate) {
      setFormError(`A medicine '${trimmedName}' with strength '${formStrength}' and form '${formDosageForm}' already exists.`);
      return;
    }

    if (trimmedBarcode) {
      const barcodeDuplicate = medicines.some(
        m => (!editingMed || m.id !== editingMed.id) && m.barcode === trimmedBarcode
      );
      if (barcodeDuplicate) {
        setFormError(`Barcode '${trimmedBarcode}' is already assigned to another medicine.`);
        return;
      }
    }

    if (editingMed) {
      updateMedicine(editingMed.id, {
        brandName: trimmedName,
        saltComposition: trimmedGeneric,
        manufacturer: trimmedMfr,
        category: formCategory,
        dosageForm: formDosageForm,
        strength: formStrength.trim(),
        schedule: formSchedule,
        packSize: formPackSize.trim(),
        uom: formUom,
        rackLocation: formRackLocation.trim(),
        hsnCode: formHsnCode.trim(),
        gstSlab: Number(formGstSlab),
        barcode: trimmedBarcode,
        prescriptionRequired: formPrescriptionRequired,
        minStockLevel: Number(formMinStockLevel),
        description: formDescription.trim() || undefined,
      });

      if (selectedMedicine && selectedMedicine.id === editingMed.id) {
        setSelectedMedicine({
          ...selectedMedicine,
          brandName: trimmedName,
          saltComposition: trimmedGeneric,
          manufacturer: trimmedMfr,
          category: formCategory,
          dosageForm: formDosageForm,
          strength: formStrength.trim(),
          schedule: formSchedule,
          packSize: formPackSize.trim(),
          uom: formUom,
          rackLocation: formRackLocation.trim(),
          hsnCode: formHsnCode.trim(),
          gstSlab: Number(formGstSlab),
          barcode: trimmedBarcode,
          prescriptionRequired: formPrescriptionRequired,
          minStockLevel: Number(formMinStockLevel),
          description: formDescription.trim() || undefined,
        });
      }
    } else {
      addMedicine({
        brandName: trimmedName,
        saltComposition: trimmedGeneric,
        manufacturer: trimmedMfr,
        category: formCategory,
        dosageForm: formDosageForm,
        strength: formStrength.trim(),
        schedule: formSchedule,
        packSize: formPackSize.trim(),
        uom: formUom,
        rackLocation: formRackLocation.trim(),
        hsnCode: formHsnCode.trim(),
        gstSlab: Number(formGstSlab),
        barcode: trimmedBarcode,
        prescriptionRequired: formPrescriptionRequired,
        minStockLevel: Number(formMinStockLevel),
        description: formDescription.trim() || undefined,
        status: 'active',
      });
    }

    setIsFormModalOpen(false);
  };

  const handleConfirmArchive = () => {
    if (!archivingMed) return;
    const isCurrentlyArchived = archivingMed.status === 'archived';
    archiveMedicine(archivingMed.id, !isCurrentlyArchived);

    if (selectedMedicine && selectedMedicine.id === archivingMed.id) {
      setSelectedMedicine({
        ...selectedMedicine,
        status: isCurrentlyArchived ? 'active' : 'archived',
      });
    }

    setArchivingMed(null);
  };

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Medicine Master Catalogue
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              {medicines.filter(m => m.status !== 'archived').length} Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standard pharmaceutical directory with salt compositions, manufacturers, schedule classes, and GST slabs
          </p>
        </div>

        {isOwnerOrPharmacist && (
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Medicine</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by brand name, salt composition, strength, barcode or manufacturer..."
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={e => {
              setSelectedCategory(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 bg-white"
          >
            <option value="all">All Dosage Forms</option>
            {CATEGORIES.map(cat => (
              <option key={cat} value={cat}>
                {cat}s
              </option>
            ))}
          </select>

          {/* Schedule Filter */}
          <select
            value={selectedSchedule}
            onChange={e => {
              setSelectedSchedule(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 bg-white"
          >
            <option value="all">All Schedules</option>
            {SCHEDULES.map(sch => (
              <option key={sch} value={sch}>
                {sch}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 bg-white"
          >
            <option value="all">Active Only</option>
            <option value="archived">Archived Catalogue</option>
            <option value="inactive">Inactive</option>
          </select>

          {(search || selectedCategory !== 'all' || selectedSchedule !== 'all' || selectedStatus !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedCategory('all');
                setSelectedSchedule('all');
                setSelectedStatus('all');
                setPage(1);
              }}
              className="text-xs text-blue-600 hover:underline px-2 py-1 cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Main Grid: Medicine Cards + Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Medicine List (2 cols on lg) */}
        <div className="lg:col-span-2 space-y-3">
          {paginatedMedicines.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Pill className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-800">No medicines found</h3>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search criteria or add a new medicine formulation.</p>
            </div>
          ) : (
            paginatedMedicines.map(med => {
              const stock = totalStockForMed(med.id);
              const isSelected = selectedMedicine?.id === med.id;
              const isArchived = med.status === 'archived';

              return (
                <div
                  key={med.id}
                  onClick={() => setSelectedMedicine(med)}
                  className={`bg-white rounded-xl border p-4 transition-all cursor-pointer shadow-2xs hover:border-blue-400 ${
                    isSelected
                      ? 'border-blue-600 ring-2 ring-blue-600/10 bg-blue-50/20'
                      : isArchived
                      ? 'border-slate-200 bg-slate-50/60 opacity-80'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {med.brandName}
                        </h3>
                        {med.strength && (
                          <span className="text-xs font-semibold text-slate-600">
                            {med.strength}
                          </span>
                        )}
                        {isArchived && (
                          <span className="text-[10px] font-semibold text-slate-600 bg-slate-200 px-1.5 py-0.2 rounded">
                            Archived
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 mt-0.5 font-medium line-clamp-1">
                        {med.saltComposition}
                      </p>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-2 flex-wrap">
                        <span>{med.manufacturer}</span>
                        <span aria-hidden="true">·</span>
                        <span>{med.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{med.packSize}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-600">GST {med.gstSlab}%</span>
                        {med.barcode && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="flex items-center gap-1 text-slate-500 font-mono">
                              <Barcode className="w-3 h-3" /> {med.barcode}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stock badge & Schedule indicator */}
                    <div className="text-right shrink-0">
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            med.schedule === 'OTC'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : med.schedule === 'Schedule H1'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {med.schedule}
                        </span>
                      </div>

                      <div className="mt-2">
                        <span className="text-xs text-slate-400 block text-[11px]">Total Stock</span>
                        <span
                          className={`text-sm font-bold font-mono ${
                            stock === 0
                              ? 'text-red-600'
                              : stock <= med.minStockLevel
                              ? 'text-amber-600'
                              : 'text-slate-900'
                          }`}
                        >
                          {stock} <span className="text-[10px] font-normal text-slate-400">{med.uom || 'units'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-slate-200 text-xs">
              <span className="text-slate-500">
                Page {page} of {totalPages} ({filteredMedicines.length} total)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50 cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Selected Medicine Details Drawer (1 col on lg) */}
        <div className="lg:col-span-1">
          {selectedMedicine ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4 sticky top-6">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                    {selectedMedicine.category} · {selectedMedicine.uom || 'strip'}
                  </span>
                  <h2 className="text-base font-bold text-slate-900 mt-0.5">
                    {selectedMedicine.brandName}
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5 font-medium">
                    {selectedMedicine.saltComposition}
                  </p>
                </div>

                {isOwnerOrPharmacist && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(selectedMedicine)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 border border-slate-200 cursor-pointer"
                      title="Edit Medicine"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setArchivingMed(selectedMedicine)}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 border border-slate-200 cursor-pointer"
                      title={selectedMedicine.status === 'archived' ? 'Restore Medicine' : 'Archive Medicine'}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Medicine Attributes Card */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Manufacturer</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block truncate">
                    {selectedMedicine.manufacturer}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Regulatory Class</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block">
                    {selectedMedicine.schedule}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">HSN Code</span>
                  <span className="font-mono text-slate-800 mt-0.5 block">
                    {selectedMedicine.hsnCode}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">GST Slab</span>
                  <span className="font-mono text-slate-800 mt-0.5 block">
                    {selectedMedicine.gstSlab}%
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Default Shelf</span>
                  <span className="font-semibold text-slate-800 mt-0.5 block flex items-center gap-1 truncate">
                    <MapPin className="w-3 h-3 text-slate-400" /> {selectedMedicine.rackLocation}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Min Reorder Level</span>
                  <span className="font-mono text-slate-800 mt-0.5 block">
                    {selectedMedicine.minStockLevel} {selectedMedicine.uom || 'units'}
                  </span>
                </div>
              </div>

              {selectedMedicine.barcode && (
                <div className="p-2.5 bg-slate-50 rounded-xl flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Barcode className="w-4 h-4 text-slate-400" /> Barcode
                  </span>
                  <span className="font-bold text-slate-800">{selectedMedicine.barcode}</span>
                </div>
              )}

              {/* Batches for this medicine */}
              <div className="pt-2 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-blue-600" />
                    Batches in Inventory ({selectedBatches.length})
                  </h4>
                  <button
                    onClick={() => setActiveQuickModal('stock')}
                    className="text-[11px] text-blue-600 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    + Inward Batch
                  </button>
                </div>

                {selectedBatches.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-2">
                    No active stock batches recorded for this medicine yet.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-56 overflow-y-auto">
                    {selectedBatches.map(batch => (
                      <div
                        key={batch.id}
                        className="p-2 rounded-lg border border-slate-200 text-xs flex items-center justify-between hover:bg-slate-50"
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-800 flex items-center gap-1.5">
                            {batch.batchNumber}
                            {batch.status === 'near_expiry' && (
                              <span className="text-[9px] bg-amber-50 text-amber-700 px-1 py-0.2 rounded font-sans font-semibold">
                                Near Exp
                              </span>
                            )}
                            {batch.status === 'expired' && (
                              <span className="text-[9px] bg-red-50 text-red-700 px-1 py-0.2 rounded font-sans font-semibold">
                                Expired
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">Exp: {batch.expiryDate}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-slate-900 block font-mono">
                            {batch.currentStock} units
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">MRP ₹{batch.mrp}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-400 text-xs">
              <Pill className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              Select a medicine from the directory to inspect formulations, statutory compliance, and batch-level stock balances.
            </div>
          )}
        </div>
      </div>

      {/* ================= MODAL: ADD / EDIT MEDICINE ================= */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                  <Pill className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editingMed ? `Edit Medicine Formulation` : `Add New Medicine to Catalogue`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Complies with Drugs and Cosmetics Act (Schedule H, H1, X & OTC standards)
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFormModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4 pt-4">
              {/* Brand Name & Generic Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Trade / Brand Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Augmentin 625 Duo"
                    value={formBrandName}
                    onChange={e => setFormBrandName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Salt Composition (Generic) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Amoxicillin + Clavulanic Acid"
                    value={formGenericName}
                    onChange={e => setFormGenericName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Manufacturer & Strength */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Manufacturer / Marketing Co. <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GlaxoSmithKline Pharmaceuticals"
                    value={formManufacturer}
                    onChange={e => setFormManufacturer(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Strength / Concentration <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 625 mg, 500 mg, 10 mg/ml"
                    value={formStrength}
                    onChange={e => setFormStrength(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Category, Form, UOM, Pack Size */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value as MedicineCategory)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Dosage Form</label>
                  <input
                    type="text"
                    placeholder="e.g. tablet, syrup"
                    value={formDosageForm}
                    onChange={e => setFormDosageForm(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Unit of Measure</label>
                  <select
                    value={formUom}
                    onChange={e => setFormUom(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="strip">Strip</option>
                    <option value="bottle">Bottle</option>
                    <option value="vial">Vial</option>
                    <option value="box">Box</option>
                    <option value="tube">Tube</option>
                    <option value="piece">Piece</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pack Size</label>
                  <input
                    type="text"
                    placeholder="e.g. 10 Tablets"
                    value={formPackSize}
                    onChange={e => setFormPackSize(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Regulatory Class, HSN, GST, Min Stock */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Schedule Class</label>
                  <select
                    value={formSchedule}
                    onChange={e => setFormSchedule(e.target.value as ScheduleCategory)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white"
                  >
                    {SCHEDULES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">HSN Code</label>
                  <input
                    type="text"
                    placeholder="300490"
                    value={formHsnCode}
                    onChange={e => setFormHsnCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">GST Rate %</label>
                  <select
                    value={formGstSlab}
                    onChange={e => setFormGstSlab(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white font-mono"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5%</option>
                    <option value={12}>12% (Standard)</option>
                    <option value={18}>18%</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Min Reorder Level</label>
                  <input
                    type="number"
                    min="0"
                    value={formMinStockLevel}
                    onChange={e => setFormMinStockLevel(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-mono"
                  />
                </div>
              </div>

              {/* Barcode & Shelf Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Barcode / GTIN (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 8901030582910"
                    value={formBarcode}
                    onChange={e => setFormBarcode(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Default Shelf / Rack Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Rack A-2, Cold Storage"
                    value={formRackLocation}
                    onChange={e => setFormRackLocation(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              {/* Prescription checkbox */}
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={formPrescriptionRequired}
                  onChange={e => setFormPrescriptionRequired(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="font-semibold">Prescription Required (Doctor verification at billing)</span>
              </label>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {editingMed ? 'Save Modifications' : 'Add to Catalogue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ARCHIVE CONFIRMATION ================= */}
      {archivingMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              {archivingMed.status === 'archived' ? 'Restore Medicine' : 'Archive Medicine Formulation'}
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {archivingMed.status === 'archived'
                ? `Restore '${archivingMed.brandName}' to the active catalogue so it can be dispensed and ordered again.`
                : `Are you sure you want to archive '${archivingMed.brandName}'? It will be hidden from default catalogue views, but historical batch stock records and past sales invoices remain permanently preserved.`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setArchivingMed(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmArchive}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg text-white shadow-xs cursor-pointer ${
                  archivingMed.status === 'archived'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {archivingMed.status === 'archived' ? 'Confirm Restoration' : 'Confirm Archival'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
