/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  Plus,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Printer,
  RotateCcw,
  AlertTriangle,
  X,
  Download,
  Undo2,
  Receipt,
  Search,
  PackagePlus,
  Truck,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  GoodsReceiptNote,
  PurchaseOrder,
  PurchaseOrderLineItem,
  PurchaseOrderStatus,
  SupplierPaymentMode,
} from '../../types/pharmacy.ts';
import { SuppliersView } from '../suppliers/SuppliersView.tsx';

interface PoDraftLine {
  medicineId: string;
  orderedQuantity: number;
  freeQuantity: number;
  unitCost: number;
  mrp: number;
  discountPercent: number;
  gstRate: number;
}

interface GrnDraftLine {
  poItemId?: string | null;
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  acceptedQuantity: number;
  rejectedQuantity: number;
  freeQuantity: number;
  rejectionReason: string;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  discountPercent: number;
  gstRate: number;
  pendingLimit?: number;
}

export type PurchasesModuleTab = 'receive' | 'po' | 'suppliers' | 'grn' | 'financials';

interface PurchasesViewProps {
  initialTab?: PurchasesModuleTab;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ initialTab }) => {
  const {
    store,
    medicines,
    inventory,
    suppliers,
    purchaseOrders,
    createPurchaseOrder,
    submitPurchaseOrder,
    approvePurchaseOrder,
    cancelPurchaseOrder,
    closePurchaseOrder,
    goodsReceipts,
    postGoodsReceipt,
    reverseGoodsReceipt,
    supplierInvoices,
    createSupplierInvoice,
    supplierPayments,
    recordSupplierPayment,
    supplierReturns,
    createSupplierReturn,
    expiryWarningDays,
    hasUserPermission,
    moduleSubTab,
    setModuleSubTab,
  } = usePharmacy();

  const canCreatePo = hasUserPermission('purchase_orders.create');
  const canApprovePo = hasUserPermission('purchase_orders.approve');
  const canCancelPo = hasUserPermission('purchase_orders.cancel');
  const canClosePo = hasUserPermission('purchase_orders.close');
  const canPostGrn = hasUserPermission('goods_receipts.post');
  const canCorrectGrn = hasUserPermission('goods_receipts.correct');
  const canCreateInv = hasUserPermission('supplier_invoices.create');
  const canPay = hasUserPermission('supplier_payments.create');
  const canReturn = hasUserPermission('supplier_returns.create');

  const [activeTab, setActiveTab] = useState<PurchasesModuleTab>(
    initialTab || (canPostGrn ? 'receive' : 'po')
  );
  const [poStatusFilter, setPoStatusFilter] = useState<'ALL' | PurchaseOrderStatus>('ALL');
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [inlineMedSearch, setInlineMedSearch] = useState('');

  // Sync deep link sub-tab from Home/Sidebar/More
  useEffect(() => {
    if (!moduleSubTab) return;
    if (['receive', 'po', 'suppliers', 'grn', 'financials'].includes(moduleSubTab)) {
      setActiveTab(moduleSubTab as PurchasesModuleTab);
      setModuleSubTab(null);
    }
  }, [moduleSubTab, setModuleSubTab]);

  // Create PO Modal
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poInvoiceDiscount, setPoInvoiceDiscount] = useState(0);
  const [poOtherCharges, setPoOtherCharges] = useState(0);
  const [poSubmitImmediately, setPoSubmitImmediately] = useState(true);
  const [poNotes, setPoNotes] = useState('');
  const [poLines, setPoLines] = useState<PoDraftLine[]>([]);

  // Post GRN Modal
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false);
  const [grnPoId, setGrnPoId] = useState<string>('');
  const [grnSupplierId, setGrnSupplierId] = useState('');
  const [grnSupplierInvNo, setGrnSupplierInvNo] = useState('');
  const [grnSupplierInvDate, setGrnSupplierInvDate] = useState(new Date().toISOString().slice(0, 10));
  const [grnShortWarnDays, setGrnShortWarnDays] = useState(expiryWarningDays || 90);
  const [grnAllowOver, setGrnAllowOver] = useState(false);
  const [grnAutoInvoice, setGrnAutoInvoice] = useState(true);
  const [grnLines, setGrnLines] = useState<GrnDraftLine[]>([]);
  const [grnError, setGrnError] = useState<string | null>(null);

  // Print Modals
  const [printPo, setPrintPo] = useState<PurchaseOrder | null>(null);
  const [printGrn, setPrintGrn] = useState<GoodsReceiptNote | null>(null);

  // Reversal / Cancel Modal
  const [actionPrompt, setActionPrompt] = useState<{
    mode: 'cancel_po' | 'reverse_grn';
    id: string;
    label: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');

  // Invoice Recognition Modal
  const [isInvModalOpen, setIsInvModalOpen] = useState(false);
  const [invSupplierId, setInvSupplierId] = useState('');
  const [invGrnId, setInvGrnId] = useState('');
  const [invNumber, setInvNumber] = useState('');
  const [invDirectTotal, setInvDirectTotal] = useState('');

  // Return Modal
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [retGrnId, setRetGrnId] = useState('');
  const [retBatchId, setRetBatchId] = useState('');
  const [retQty, setRetQty] = useState(1);
  const [retReason, setRetReason] = useState('');

  const activeSuppliers = useMemo(
    () => suppliers.filter(s => !s.isArchived && (s.status || 'ACTIVE') === 'ACTIVE'),
    [suppliers]
  );

  // Initialize default supplier on inline receive flow
  useEffect(() => {
    if (!grnSupplierId && activeSuppliers.length > 0) {
      setGrnSupplierId(activeSuppliers[0]!.id);
    }
  }, [activeSuppliers, grnSupplierId]);

  // Fast medicine lookup for inline Receive Stock search
  const searchableMedicines = useMemo(() => {
    const q = inlineMedSearch.trim().toLowerCase();
    const list = medicines.filter(m => m.status !== 'archived');
    if (!q) return list.slice(0, 6);
    return list
      .filter(
        m =>
          m.brandName.toLowerCase().includes(q) ||
          m.saltComposition.toLowerCase().includes(q) ||
          (m.barcode && m.barcode.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [medicines, inlineMedSearch]);

  const openReceivablePos = useMemo(
    () => purchaseOrders.filter(p => p.status === 'APPROVED' || p.status === 'PARTIALLY_RECEIVED'),
    [purchaseOrders]
  );

  const loadPoIntoInlineReceive = (po: PurchaseOrder) => {
    setGrnError(null);
    setGrnAllowOver(false);
    setGrnAutoInvoice(true);
    setGrnPoId(po.id);
    setGrnSupplierId(po.supplierId);
    setGrnLines(
      po.items
        .filter(l => l.pendingQuantity > 0)
        .map(l => ({
          poItemId: l.id,
          medicineId: l.medicineId,
          medicineName: l.medicineName,
          batchNumber: '',
          manufacturingDate: '',
          expiryDate: '2028-06',
          acceptedQuantity: l.pendingQuantity,
          rejectedQuantity: 0,
          freeQuantity: l.freeQuantity || 0,
          rejectionReason: '',
          purchasePrice: l.unitCost,
          mrp: l.mrp || Math.round(l.unitCost * 1.3 * 100) / 100,
          sellingPrice: l.mrp || Math.round(l.unitCost * 1.3 * 100) / 100,
          discountPercent: l.discountPercent,
          gstRate: l.gstRate,
          pendingLimit: l.pendingQuantity,
        }))
    );
    setActiveTab('receive');
  };

  const addMedicineToReceiveLines = (medId: string) => {
    const med = medicines.find(m => m.id === medId);
    if (!med) return;
    const latestBatch = inventory.find(b => b.medicineId === med.id);
    const defaultPtr = latestBatch ? latestBatch.ptr : 25;
    const defaultMrp = latestBatch ? latestBatch.mrp : 35;
    setGrnLines(prev => [
      ...prev,
      {
        poItemId: null,
        medicineId: med.id,
        medicineName: med.brandName,
        batchNumber: '',
        manufacturingDate: '',
        expiryDate: '2028-06',
        acceptedQuantity: 10,
        rejectedQuantity: 0,
        freeQuantity: 0,
        rejectionReason: '',
        purchasePrice: defaultPtr,
        mrp: defaultMrp,
        sellingPrice: defaultMrp,
        discountPercent: 0,
        gstRate: med.gstSlab || 12,
      },
    ]);
    setInlineMedSearch('');
  };

  const tenantStateCode = store.gstin?.slice(0, 2) || '27';

  const summary = useMemo(() => {
    const openPos = purchaseOrders.filter(p =>
      ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status)
    );
    const postedGrns = goodsReceipts.filter(g => g.status === 'POSTED');
    const unpaidBills = supplierInvoices.filter(
      i => i.paymentStatus !== 'REVERSED' && i.outstandingAmount > 0
    );
    const rejectedUnits = postedGrns.reduce((s, g) => s + g.totalRejectedQty, 0);
    const warningCount = postedGrns.reduce((s, g) => s + g.warnings.length, 0);
    return {
      openPoCount: openPos.length,
      openPoValue: openPos.reduce((s, p) => s + p.grandTotal, 0),
      postedGrnCount: postedGrns.length,
      unpaidAmount: unpaidBills.reduce((s, i) => s + i.outstandingAmount, 0),
      rejectedUnits,
      warningCount,
    };
  }, [purchaseOrders, goodsReceipts, supplierInvoices]);

  const filteredPos = useMemo(() => {
    if (poStatusFilter === 'ALL') return purchaseOrders;
    return purchaseOrders.filter(p => p.status === poStatusFilter);
  }, [purchaseOrders, poStatusFilter]);

  // Dynamic PO Calculation Preview
  const poPreview = useMemo(() => {
    const sup = suppliers.find(s => s.id === poSupplierId);
    const isInterState = Boolean(sup?.stateCode && sup.stateCode !== tenantStateCode);
    let subtotal = 0;
    let lineDiscounts = 0;
    let totalTax = 0;
    poLines.forEach(l => {
      const gross = l.orderedQuantity * l.unitCost;
      const disc = gross * (l.discountPercent / 100);
      const taxable = Math.max(0, gross - disc);
      const tax = taxable * (l.gstRate / 100);
      subtotal += gross;
      lineDiscounts += disc;
      totalTax += tax;
    });
    const taxableAfterInvDisc = Math.max(0, subtotal - lineDiscounts - poInvoiceDiscount);
    const cgst = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
    const sgst = isInterState ? 0 : Math.round((totalTax - cgst) * 100) / 100;
    const igst = isInterState ? Math.round(totalTax * 100) / 100 : 0;
    const rawGrand = taxableAfterInvDisc + cgst + sgst + igst + poOtherCharges;
    const grandTotal = Math.round(rawGrand);
    const roundOff = Math.round((grandTotal - rawGrand) * 100) / 100;
    return { isInterState, subtotal, totalDiscount: lineDiscounts + poInvoiceDiscount, taxableAmount: taxableAfterInvDisc, cgst, sgst, igst, roundOff, grandTotal };
  }, [poLines, poSupplierId, suppliers, tenantStateCode, poInvoiceDiscount, poOtherCharges]);

  const openNewPoModal = () => {
    const firstSup = activeSuppliers[0];
    const firstMed = medicines[0];
    setPoSupplierId(firstSup?.id || '');
    setPoExpectedDate('');
    setPoInvoiceDiscount(0);
    setPoOtherCharges(0);
    setPoSubmitImmediately(true);
    setPoNotes('');
    setPoLines(
      firstMed
        ? [
            {
              medicineId: firstMed.id,
              orderedQuantity: 20,
              freeQuantity: 0,
              unitCost: 26.2,
              mrp: 34.5,
              discountPercent: 0,
              gstRate: firstMed.gstSlab || 12,
            },
          ]
        : []
    );
    setIsPoModalOpen(true);
  };

  const handleSavePo = (e: React.FormEvent) => {
    e.preventDefault();
    const sup = activeSuppliers.find(s => s.id === poSupplierId);
    if (!sup || poLines.length === 0) return;

    const items: PurchaseOrderLineItem[] = poLines.map((l, idx) => {
      const med = medicines.find(m => m.id === l.medicineId)!;
      const gross = Math.round(l.orderedQuantity * l.unitCost * 100) / 100;
      const discAmt = Math.round(gross * (l.discountPercent / 100) * 100) / 100;
      const taxable = Math.round((gross - discAmt) * 100) / 100;
      const tax = Math.round((taxable * l.gstRate) / 100 * 100) / 100;
      const lineCgst = poPreview.isInterState ? 0 : Math.round((tax / 2) * 100) / 100;
      const lineSgst = poPreview.isInterState ? 0 : Math.round((tax - lineCgst) * 100) / 100;
      const lineIgst = poPreview.isInterState ? tax : 0;
      return {
        id: `poi-${Date.now().toString(36)}-${idx}`,
        medicineId: med.id,
        medicineName: med.brandName,
        genericName: med.saltComposition,
        brand: med.manufacturer,
        packSize: med.packSize,
        hsnCode: med.hsnCode || '300490',
        orderedQuantity: l.orderedQuantity,
        freeQuantity: l.freeQuantity,
        receivedQuantity: 0,
        rejectedQuantity: 0,
        pendingQuantity: l.orderedQuantity,
        unitCost: l.unitCost,
        mrp: l.mrp,
        discountPercent: l.discountPercent,
        discountAmount: discAmt,
        taxableAmount: taxable,
        gstRate: l.gstRate,
        cgst: lineCgst,
        sgst: lineSgst,
        igst: lineIgst,
        lineTotal: Math.round((taxable + tax) * 100) / 100,
      };
    });

    const totalOrderedQty = items.reduce((s, i) => s + i.orderedQuantity, 0);
    const created = createPurchaseOrder({
      tenantId: store.id,
      branchId: 'main',
      supplierId: sup.id,
      supplierCode: sup.supplierCode || 'SUP',
      supplierName: sup.agencyName,
      supplierGstin: sup.gstin,
      supplierStateCode: sup.stateCode || '27',
      tenantStateCode,
      placeOfSupplyStateCode: sup.stateCode || '27',
      isInterState: poPreview.isInterState,
      orderDate: new Date().toISOString(),
      expectedDeliveryDate: poExpectedDate || null,
      status: poSubmitImmediately ? 'PENDING_APPROVAL' : 'DRAFT',
      items,
      subtotal: Math.round(poPreview.subtotal * 100) / 100,
      totalDiscount: Math.round(poPreview.totalDiscount * 100) / 100,
      invoiceDiscount: poInvoiceDiscount,
      otherCharges: poOtherCharges,
      taxableAmount: Math.round(poPreview.taxableAmount * 100) / 100,
      cgst: poPreview.cgst,
      sgst: poPreview.sgst,
      igst: poPreview.igst,
      totalTax: Math.round((poPreview.cgst + poPreview.sgst + poPreview.igst) * 100) / 100,
      roundOff: poPreview.roundOff,
      grandTotal: poPreview.grandTotal,
      totalOrderedQty,
      totalReceivedQty: 0,
      totalPendingQty: totalOrderedQty,
      paymentTerms: sup.paymentTerms,
      notes: poNotes.trim() || null,
    });
    setIsPoModalOpen(false);
    setBanner({ type: 'ok', text: `Created Purchase Order ${created.poNumber} (${created.status}).` });
  };

  const openGrnModalForPo = (po?: PurchaseOrder) => {
    setGrnError(null);
    setGrnAllowOver(false);
    setGrnAutoInvoice(true);
    setGrnSupplierInvNo('');
    if (po) {
      setGrnPoId(po.id);
      setGrnSupplierId(po.supplierId);
      setGrnLines(
        po.items
          .filter(l => l.pendingQuantity > 0)
          .map(l => ({
            poItemId: l.id,
            medicineId: l.medicineId,
            medicineName: l.medicineName,
            batchNumber: '',
            manufacturingDate: '',
            expiryDate: '2028-06',
            acceptedQuantity: l.pendingQuantity,
            rejectedQuantity: 0,
            freeQuantity: l.freeQuantity || 0,
            rejectionReason: '',
            purchasePrice: l.unitCost,
            mrp: l.mrp || Math.round(l.unitCost * 1.3 * 100) / 100,
            sellingPrice: l.mrp || Math.round(l.unitCost * 1.3 * 100) / 100,
            discountPercent: l.discountPercent,
            gstRate: l.gstRate,
            pendingLimit: l.pendingQuantity,
          }))
      );
    } else {
      const sup = activeSuppliers[0];
      const med = medicines[0];
      setGrnPoId('');
      setGrnSupplierId(sup?.id || '');
      setGrnLines(
        med
          ? [
              {
                poItemId: null,
                medicineId: med.id,
                medicineName: med.brandName,
                batchNumber: '',
                manufacturingDate: '',
                expiryDate: '2028-06',
                acceptedQuantity: 10,
                rejectedQuantity: 0,
                freeQuantity: 0,
                rejectionReason: '',
                purchasePrice: 26,
                mrp: 35,
                sellingPrice: 35,
                discountPercent: 0,
                gstRate: med.gstSlab || 12,
              },
            ]
          : []
      );
    }
    setIsGrnModalOpen(true);
  };

  const handlePostGrn = (e: React.FormEvent) => {
    e.preventDefault();
    setGrnError(null);
    if (grnLines.some(l => !l.batchNumber.trim())) {
      setGrnError('Every batch row requires a Batch Number.');
      return;
    }
    if (grnAutoInvoice && !grnSupplierInvNo.trim()) {
      setGrnError('Enter Supplier Tax Invoice Number or uncheck automatic bill creation.');
      return;
    }
    const res = postGoodsReceipt({
      poId: grnPoId || null,
      supplierId: grnSupplierId,
      supplierInvoiceNumber: grnSupplierInvNo.trim() || undefined,
      supplierInvoiceDate: grnSupplierInvDate,
      shortExpiryWarningDays: grnShortWarnDays,
      allowOverReceipt: grnAllowOver,
      autoCreateInvoice: grnAutoInvoice,
      items: grnLines.map(l => ({
        poItemId: l.poItemId,
        medicineId: l.medicineId,
        batchNumber: l.batchNumber,
        manufacturingDate: l.manufacturingDate || null,
        expiryDate: l.expiryDate,
        acceptedQuantity: Number(l.acceptedQuantity) || 0,
        rejectedQuantity: Number(l.rejectedQuantity) || 0,
        freeQuantity: Number(l.freeQuantity) || 0,
        rejectionReason: l.rejectionReason,
        purchasePrice: Number(l.purchasePrice) || 0,
        mrp: Number(l.mrp) || 0,
        sellingPrice: Number(l.sellingPrice) || Number(l.mrp) || 0,
        discountPercent: Number(l.discountPercent) || 0,
        gstRate: Number(l.gstRate) || 12,
      })),
    });

    if (!res.ok) {
      setGrnError(res.error || 'Failed to post GRN');
      return;
    }
    setIsGrnModalOpen(false);
    const warnSuffix =
      res.grn && res.grn.warnings.length > 0
        ? ` (${res.grn.warnings.length} short-expiry warning alert raised)`
        : '';
    setBanner({
      type: 'ok',
      text: `Posted ${res.grn?.grnNumber} (+${res.grn?.totalAcceptedQty} saleable packs added to Inventory)${warnSuffix}.`,
    });
    setActiveTab('grn');
  };

  const handleActionReasonSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionPrompt) return;
    if (actionPrompt.mode === 'cancel_po') {
      cancelPurchaseOrder(actionPrompt.id, actionReason);
      setBanner({ type: 'ok', text: `Cancelled ${actionPrompt.label}.` });
    } else {
      const res = reverseGoodsReceipt(actionPrompt.id, actionReason);
      if (!res.ok) setBanner({ type: 'err', text: res.error || 'Cannot reverse GRN' });
      else setBanner({ type: 'ok', text: `Reversed ${actionPrompt.label} safely (audit log preserved).` });
    }
    setActionPrompt(null);
    setActionReason('');
  };

  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createSupplierInvoice({
      supplierId: invSupplierId,
      grnId: invGrnId || null,
      supplierInvoiceNumber: invNumber,
      totalAmount: invGrnId ? undefined : Number(invDirectTotal),
    });
    if (!res.ok) {
      setBanner({ type: 'err', text: res.error || 'Failed to record supplier bill' });
      return;
    }
    setIsInvModalOpen(false);
    setInvNumber('');
    setInvDirectTotal('');
    setBanner({ type: 'ok', text: `Recorded supplier invoice ${res.invoice?.supplierInvoiceNumber}.` });
  };

  const handleCreateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createSupplierReturn({
      grnId: retGrnId,
      reason: retReason,
      items: [{ batchId: retBatchId, quantity: Number(retQty) }],
    });
    if (!res.ok) {
      setBanner({ type: 'err', text: res.error || 'Failed to create supplier return' });
      return;
    }
    setIsReturnModalOpen(false);
    setRetReason('');
    setBanner({
      type: 'ok',
      text: `Posted Supplier Return ${res.supplierReturn?.returnNumber} (Credit Note ${res.supplierReturn?.creditNoteNumber}).`,
    });
  };

  const exportReportsCsv = () => {
    const header = ['Supplier Code', 'Supplier Name', 'Total Purchases', 'Outstanding Payables'].join(',');
    const rows = suppliers.map(s =>
      [s.supplierCode || s.id, `"${s.agencyName}"`, (s.totalPurchases || 0).toFixed(2), (s.outstandingBalance || 0).toFixed(2)].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pharmadesk-procurement-summary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900">
            Purchases &amp; Stock Receiving
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Receive medicines from suppliers into store stock, check open orders, and clear supplier bills.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {canPostGrn && (
            <button
              type="button"
              onClick={() => setActiveTab('receive')}
              className="px-3.5 py-2 border border-blue-600 text-blue-700 hover:bg-blue-50 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <PackagePlus className="w-4 h-4" />
              <span>Receive Stock</span>
            </button>
          )}
          {canCreatePo && (
            <button
              type="button"
              onClick={openNewPoModal}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Supplier Order</span>
            </button>
          )}
        </div>
      </div>

      {banner && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
            banner.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Open Orders
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            {summary.openPoCount}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            ₹{summary.openPoValue.toLocaleString('en-IN')} waiting delivery
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Stock Receipts
          </span>
          <div className="text-2xl font-bold font-mono text-blue-700 tabular-nums mt-1">
            {summary.postedGrnCount}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Verified deliveries posted</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Supplier Bills Due
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums mt-1">
            ₹{summary.unpaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">Unpaid supplier bills</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Short Expiry Alerts
          </span>
          <div className="text-2xl font-bold font-mono text-amber-700 tabular-nums mt-1">
            {summary.warningCount}
          </div>
          <span className="text-[11px] text-slate-500 mt-0.5 block">
            {summary.rejectedUnits} damaged/rejected units
          </span>
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-4 sm:px-5 border-b border-slate-200 flex gap-5 overflow-x-auto text-xs font-semibold">
          {(
            [
              ['receive', 'Receive Stock'],
              ['po', `Orders to Suppliers (${purchaseOrders.length})`],
              ['suppliers', `Suppliers (${activeSuppliers.length})`],
              ['grn', `Purchase History (${goodsReceipts.length})`],
              ['financials', `Supplier Payments (${supplierInvoices.length})`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`py-3.5 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                activeTab === id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* TAB 0: GUIDED INLINE RECEIVE STOCK */}
        {activeTab === 'receive' && (
          <div className="p-4 sm:p-5 space-y-5">
            {!canPostGrn ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                Your active role can view purchase orders and history, while adding incoming stock requires pharmacist or owner access.
              </div>
            ) : (
              <form onSubmit={handlePostGrn} className="space-y-4">
                {grnError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{grnError}</span>
                  </div>
                )}

                {/* Step 1: Pick Supplier or Approved Order */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                        Step 1 · Select Supplier or Open Order
                      </span>
                      <p className="text-xs text-slate-600">
                        Choose who delivered the stock, or pick an open order to auto-fill items.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Supplier *
                      </label>
                      <select
                        required
                        value={grnSupplierId}
                        onChange={e => {
                          setGrnSupplierId(e.target.value);
                          setGrnPoId('');
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      >
                        {activeSuppliers.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.agencyName}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Supplier Bill / Challan No. {grnAutoInvoice ? '*' : '(Optional)'}
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. INV-2026-441"
                        value={grnSupplierInvNo}
                        onChange={e => setGrnSupplierInvNo(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Bill Date
                      </label>
                      <input
                        type="date"
                        value={grnSupplierInvDate}
                        onChange={e => setGrnSupplierInvDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono bg-white"
                      />
                    </div>
                  </div>

                  {openReceivablePos.length > 0 && (
                    <div className="pt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500 font-medium">Load from open order:</span>
                      {openReceivablePos.slice(0, 4).map(po => (
                        <button
                          key={po.id}
                          type="button"
                          onClick={() => loadPoIntoInlineReceive(po)}
                          className={`px-2.5 py-1 rounded-lg border font-semibold cursor-pointer ${
                            grnPoId === po.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {po.poNumber} · {po.supplierName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 2: Search & Add Medicines */}
                <div className="p-4 rounded-xl border border-slate-200 space-y-3 bg-white">
                  <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                    Step 2 · Add Medicines Received
                  </span>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={inlineMedSearch}
                      onChange={e => setInlineMedSearch(e.target.value)}
                      placeholder="Search medicine by name, salt, or scan barcode to add..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {searchableMedicines.map(med => (
                      <button
                        key={med.id}
                        type="button"
                        onClick={() => addMedicineToReceiveLines(med.id)}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-800 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3 text-blue-600" />
                        <span>{med.brandName}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 3: Batch, Expiry, Quantity & Rates */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Step 3 · Check Batch No, Expiry, Quantity &amp; MRP ({grnLines.length} item{grnLines.length === 1 ? '' : 's'})
                    </span>
                    {grnLines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setGrnLines([])}
                        className="text-rose-600 hover:underline font-medium cursor-pointer"
                      >
                        Clear list
                      </button>
                    )}
                  </div>

                  {grnLines.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Click any medicine above (or select an open order) to start entering received packs.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {grnLines.map((line, idx) => (
                        <div key={`${line.medicineId}-${idx}`} className="p-3.5 grid grid-cols-2 sm:grid-cols-12 gap-2 items-end text-xs">
                          <div className="col-span-2 sm:col-span-3">
                            <span className="font-bold text-slate-900 block">{line.medicineName}</span>
                            {line.pendingLimit !== undefined && (
                              <span className="text-[10px] text-blue-600 font-medium">
                                Ordered pending: {line.pendingLimit}
                              </span>
                            )}
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] text-slate-500 mb-0.5">Batch No *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. B-904"
                              value={line.batchNumber}
                              onChange={e =>
                                setGrnLines(prev =>
                                  prev.map((x, i) => (i === idx ? { ...x, batchNumber: e.target.value.toUpperCase() } : x))
                                )
                              }
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg font-mono uppercase"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-[10px] text-slate-500 mb-0.5">Expiry *</label>
                            <input
                              type="month"
                              required
                              value={line.expiryDate}
                              onChange={e =>
                                setGrnLines(prev =>
                                  prev.map((x, i) => (i === idx ? { ...x, expiryDate: e.target.value } : x))
                                )
                              }
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-[10px] text-slate-500 mb-0.5">Qty *</label>
                            <input
                              type="number"
                              min="1"
                              required
                              value={line.acceptedQuantity}
                              onChange={e =>
                                setGrnLines(prev =>
                                  prev.map((x, i) => (i === idx ? { ...x, acceptedQuantity: Number(e.target.value) } : x))
                                )
                              }
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-[10px] text-slate-500 mb-0.5">Free</label>
                            <input
                              type="number"
                              min="0"
                              value={line.freeQuantity}
                              onChange={e =>
                                setGrnLines(prev =>
                                  prev.map((x, i) => (i === idx ? { ...x, freeQuantity: Number(e.target.value) } : x))
                                )
                              }
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-[10px] text-slate-500 mb-0.5">Rate ₹</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.1"
                              required
                              value={line.purchasePrice}
                              onChange={e =>
                                setGrnLines(prev =>
                                  prev.map((x, i) => (i === idx ? { ...x, purchasePrice: Number(e.target.value) } : x))
                                )
                              }
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                            />
                          </div>
                          <div className="sm:col-span-1">
                            <label className="block text-[10px] text-slate-500 mb-0.5">MRP ₹</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0.1"
                              required
                              value={line.mrp}
                              onChange={e =>
                                setGrnLines(prev =>
                                  prev.map((x, i) => (i === idx ? { ...x, mrp: Number(e.target.value), sellingPrice: Number(e.target.value) } : x))
                                )
                              }
                              className="w-full px-2 py-1.5 border border-slate-300 rounded-lg font-mono"
                            />
                          </div>
                          <div className="sm:col-span-1 text-right">
                            <button
                              type="button"
                              onClick={() => setGrnLines(prev => prev.filter((_, i) => i !== idx))}
                              className="px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg font-bold cursor-pointer"
                              title="Remove item"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Step 4: Review & Confirm */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={grnAutoInvoice}
                      onChange={e => setGrnAutoInvoice(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="font-medium">Also record unpaid supplier bill using Bill No. above</span>
                  </label>

                  <button
                    type="submit"
                    disabled={grnLines.length === 0}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-xl inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Add {grnLines.length} Item{grnLines.length === 1 ? '' : 's'} to Stock</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 1: ORDERS TO SUPPLIERS */}
        {activeTab === 'po' && (
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(['ALL', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED'] as const).map(
                  st => (
                    <button
                      key={st}
                      onClick={() => setPoStatusFilter(st)}
                      className={`px-2.5 py-1 rounded-md font-semibold border cursor-pointer ${
                        poStatusFilter === st
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-3 px-4">PO Number</th>
                    <th className="py-3 px-4">Supplier & GST Type</th>
                    <th className="py-3 px-4">Progress (Qty)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right font-mono">Total (₹)</th>
                    <th className="py-3 px-4 text-right">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPos.map(po => (
                    <tr key={po.id} className="hover:bg-slate-50/70">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-slate-900">{po.poNumber}</div>
                        <div className="text-[11px] text-slate-500">{po.orderDate.slice(0, 10)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{po.supplierName}</div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {po.isInterState ? `IGST (POS ${po.placeOfSupplyStateCode})` : `CGST + SGST (POS ${po.placeOfSupplyStateCode})`}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {po.totalReceivedQty} / {po.totalOrderedQty} received
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-700">{po.status}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-bold">
                        ₹{po.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                        {po.status === 'DRAFT' && (
                          <button
                            onClick={() => submitPurchaseOrder(po.id)}
                            className="px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 rounded"
                          >
                            Submit
                          </button>
                        )}
                        {(po.status === 'DRAFT' || po.status === 'PENDING_APPROVAL') && canApprovePo && (
                          <button
                            onClick={() => approvePurchaseOrder(po.id)}
                            className="px-2 py-1 text-[11px] font-semibold bg-emerald-600 text-white rounded hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                        )}
                        {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && canPostGrn && (
                          <button
                            onClick={() => loadPoIntoInlineReceive(po)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer"
                          >
                            Receive Stock
                          </button>
                        )}
                        {po.status === 'PARTIALLY_RECEIVED' && canClosePo && (
                          <button
                            onClick={() => closePurchaseOrder(po.id)}
                            className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded"
                          >
                            Short-Close
                          </button>
                        )}
                        {po.totalReceivedQty === 0 && po.status !== 'CANCELLED' && po.status !== 'CLOSED' && canCancelPo && (
                          <button
                            onClick={() => setActionPrompt({ mode: 'cancel_po', id: po.id, label: po.poNumber })}
                            className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 rounded"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => setPrintPo(po)}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 rounded"
                          title="Print PO"
                        >
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: EMBEDDED SUPPLIERS DIRECTORY */}
        {activeTab === 'suppliers' && (
          <div className="p-4 sm:p-5">
            <SuppliersView embedded />
          </div>
        )}

        {/* TAB 2: PURCHASE HISTORY (GRN) */}
        {activeTab === 'grn' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-500">
                Showing {goodsReceipts.length} posted delivery receipt(s)
              </div>
              <button
                type="button"
                onClick={exportReportsCsv}
                className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1 hover:bg-slate-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
            {goodsReceipts.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs">
                <ShoppingBag className="w-9 h-9 mx-auto mb-2 opacity-40" />
                No stock receipts yet. Open &ldquo;Receive Stock&rdquo; to add items into store inventory.
              </div>
            ) : (
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <th className="py-3 px-4">GRN Number</th>
                      <th className="py-3 px-4">Supplier & Bill No.</th>
                      <th className="py-3 px-4">Accepted / Rej / Free</th>
                      <th className="py-3 px-4">Alerts & Status</th>
                      <th className="py-3 px-4 text-right font-mono">Net Value (₹)</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {goodsReceipts.map(grn => (
                      <tr key={grn.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-slate-900">{grn.grnNumber}</div>
                          <div className="text-[11px] text-slate-500">
                            {grn.receiptDate.slice(0, 10)} {grn.poNumber ? `· ${grn.poNumber}` : '· Direct'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{grn.supplierName}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            Bill: {grn.supplierInvoiceNumber || 'Unbilled'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className="text-emerald-700 font-semibold">{grn.totalAcceptedQty}</span> /{' '}
                          <span className="text-rose-700">{grn.totalRejectedQty}</span> /{' '}
                          <span className="text-blue-700">{grn.totalFreeQty}</span>
                        </td>
                        <td className="py-3 px-4">
                          <div className={`font-semibold ${grn.status === 'REVERSED' ? 'text-rose-700' : 'text-emerald-700'}`}>
                            {grn.status}
                          </div>
                          {grn.warnings.length > 0 && (
                            <div className="text-[11px] text-amber-700">
                              {grn.warnings.length} short-expiry warning(s)
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                          ₹{grn.grandTotal.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap space-x-1.5">
                          <button
                            onClick={() => setPrintGrn(grn)}
                            className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded"
                          >
                            Print GRN
                          </button>
                          {grn.status === 'POSTED' && canReturn && (
                            <button
                              onClick={() => {
                                const firstBatch = grn.items.find(i => i.inventoryBatchId)?.inventoryBatchId || '';
                                setRetGrnId(grn.id);
                                setRetBatchId(firstBatch);
                                setRetQty(1);
                                setRetReason('');
                                setIsReturnModalOpen(true);
                              }}
                              className="px-2 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-50 rounded"
                            >
                              Return Stock
                            </button>
                          )}
                          {grn.status === 'POSTED' && canCorrectGrn && (
                            <button
                              onClick={() =>
                                setActionPrompt({ mode: 'reverse_grn', id: grn.id, label: grn.grnNumber })
                              }
                              className="px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 rounded"
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: BILLS, PAYMENTS & RETURNS */}
        {activeTab === 'financials' && (
          <div className="p-5 space-y-6 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-slate-900">Supplier Invoices & Credit Notes</h3>
              <div className="flex gap-2">
                {canCreateInv && (
                  <button
                    onClick={() => {
                      const unbilledGrn = goodsReceipts.find(g => g.status === 'POSTED' && !g.linkedInvoiceId);
                      setInvGrnId(unbilledGrn?.id || '');
                      setInvSupplierId(unbilledGrn?.supplierId || activeSuppliers[0]?.id || '');
                      setIsInvModalOpen(true);
                    }}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold flex items-center gap-1"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Recognize Supplier Bill
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">Invoice No.</th>
                    <th className="py-2.5 px-3">Supplier & Basis</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right font-mono">Total (₹)</th>
                    <th className="py-2.5 px-3 text-right font-mono">Outstanding (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {supplierInvoices.map(inv => (
                    <tr key={inv.id}>
                      <td className="py-2.5 px-3 font-mono font-bold">{inv.supplierInvoiceNumber}</td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold">{inv.supplierName}</div>
                        <div className="text-[11px] text-slate-500">
                          {inv.grnNumber ? `GRN ${inv.grnNumber}` : 'Direct Expense / Opening Bill'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono">{inv.dueDate.slice(0, 10)}</td>
                      <td className="py-2.5 px-3 font-semibold">{inv.paymentStatus}</td>
                      <td className="py-2.5 px-3 text-right font-mono">₹{inv.totalAmount.toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">₹{inv.outstandingAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-slate-800">Recent Outgoing Payments</h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab('suppliers')}
                    className="text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    Open Suppliers &rarr;
                  </button>
                </div>
                {supplierPayments.length === 0 ? (
                  <p className="text-slate-500">No supplier payments recorded yet. Open Suppliers tab to pay any vendor.</p>
                ) : (
                  <div className="space-y-2">
                    {supplierPayments.map(p => (
                      <div key={p.id} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                        <div>
                          <div className="font-mono font-semibold">{p.paymentNumber} · {p.supplierName}</div>
                          <div className="text-[11px] text-slate-500">{p.paymentMode} {p.referenceNumber || ''}</div>
                        </div>
                        <div className="font-mono font-bold text-emerald-700">₹{p.amount.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-slate-200 rounded-xl p-4">
                <h4 className="font-bold text-slate-800 mb-3">Purchase Returns & Credit Notes</h4>
                {supplierReturns.length === 0 ? (
                  <p className="text-slate-500">No supplier returns posted yet.</p>
                ) : (
                  <div className="space-y-2">
                    {supplierReturns.map(r => (
                      <div key={r.id} className="flex justify-between py-2 border-b border-slate-100 last:border-0">
                        <div>
                          <div className="font-mono font-semibold">{r.returnNumber} · {r.creditNoteNumber}</div>
                          <div className="text-[11px] text-slate-500">{r.supplierName} · {r.reason}</div>
                        </div>
                        <div className="font-mono font-bold text-amber-700">₹{r.totalAmount.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CREATE PO MODAL */}
      {isPoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handleSavePo}
            className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 text-xs"
          >
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="font-bold text-slate-900 uppercase tracking-wider">Create Purchase Order</h3>
                <p className="text-[11px] text-slate-500">
                  Only ACTIVE non-blocked suppliers allowed · Tax Mode:{' '}
                  <span className="font-semibold text-blue-700">
                    {poPreview.isInterState ? 'Inter-State IGST' : 'Intra-State CGST + SGST'}
                  </span>
                </p>
              </div>
              <button type="button" onClick={() => setIsPoModalOpen(false)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Active Supplier *</label>
                  <select
                    required
                    value={poSupplierId}
                    onChange={e => setPoSupplierId(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {activeSuppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.agencyName} ({s.stateCode || '27'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expected Delivery</label>
                  <input
                    type="date"
                    value={poExpectedDate}
                    onChange={e => setPoExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={poSubmitImmediately}
                      onChange={e => setPoSubmitImmediately(e.target.checked)}
                    />
                    <span className="font-medium text-slate-700">Submit for approval immediately</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Order Medicine Items</span>
                  <button
                    type="button"
                    onClick={() => {
                      const med = medicines[0];
                      if (!med) return;
                      setPoLines(prev => [
                        ...prev,
                        { medicineId: med.id, orderedQuantity: 10, freeQuantity: 0, unitCost: 25, mrp: 35, discountPercent: 0, gstRate: med.gstSlab || 12 },
                      ]);
                    }}
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded font-semibold"
                  >
                    + Add Line
                  </button>
                </div>

                {poLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 border border-slate-200 rounded-lg">
                    <select
                      value={line.medicineId}
                      onChange={e => {
                        const med = medicines.find(m => m.id === e.target.value);
                        setPoLines(prev =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, medicineId: e.target.value, gstRate: med?.gstSlab ?? x.gstRate } : x
                          )
                        );
                      }}
                      className="col-span-4 px-2 py-1.5 border border-slate-300 rounded bg-white"
                    >
                      {medicines.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.brandName} ({m.packSize})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      placeholder="Qty"
                      value={line.orderedQuantity}
                      onChange={e =>
                        setPoLines(prev => prev.map((x, i) => (i === idx ? { ...x, orderedQuantity: Number(e.target.value) } : x)))
                      }
                      className="col-span-2 px-2 py-1.5 border border-slate-300 rounded font-mono"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="PTR ₹"
                      value={line.unitCost}
                      onChange={e =>
                        setPoLines(prev => prev.map((x, i) => (i === idx ? { ...x, unitCost: Number(e.target.value) } : x)))
                      }
                      className="col-span-2 px-2 py-1.5 border border-slate-300 rounded font-mono"
                    />
                    <input
                      type="number"
                      min="0"
                      max="100"
                      placeholder="Disc %"
                      value={line.discountPercent}
                      onChange={e =>
                        setPoLines(prev => prev.map((x, i) => (i === idx ? { ...x, discountPercent: Number(e.target.value) } : x)))
                      }
                      className="col-span-1 px-2 py-1.5 border border-slate-300 rounded font-mono"
                    />
                    <input
                      type="number"
                      min="0"
                      max="28"
                      placeholder="GST%"
                      value={line.gstRate}
                      onChange={e =>
                        setPoLines(prev => prev.map((x, i) => (i === idx ? { ...x, gstRate: Number(e.target.value) } : x)))
                      }
                      className="col-span-2 px-2 py-1.5 border border-slate-300 rounded font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setPoLines(prev => prev.filter((_, i) => i !== idx))}
                      className="col-span-1 text-rose-600 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono">
                <div>
                  <span className="text-[10px] text-slate-500 block">Taxable</span>
                  <span>₹{poPreview.taxableAmount.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">CGST / SGST</span>
                  <span>
                    ₹{poPreview.cgst.toFixed(2)} + ₹{poPreview.sgst.toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">IGST</span>
                  <span>₹{poPreview.igst.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Round Off</span>
                  <span>₹{poPreview.roundOff.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">Grand Total</span>
                  <span className="font-bold text-slate-900">₹{poPreview.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setIsPoModalOpen(false)} className="px-3 py-1.5 text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg">
                  Create Purchase Order
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* POST GRN MODAL */}
      {isGrnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <form
            onSubmit={handlePostGrn}
            className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 text-xs"
          >
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between sticky top-0">
              <div>
                <h3 className="font-bold text-slate-900 uppercase tracking-wider">
                  Goods Receipt Note (GRN) — Batch Inwarding
                </h3>
                <p className="text-[11px] text-slate-500">
                  Splits multi-batch deliveries, rejects expired stock, posts INVENTORY_BATCH + PURCHASE_RECEIPT ledger atomically
                </p>
              </div>
              <button type="button" onClick={() => setIsGrnModalOpen(false)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {grnError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg font-medium">
                  {grnError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier *</label>
                  <select
                    value={grnSupplierId}
                    disabled={Boolean(grnPoId)}
                    onChange={e => setGrnSupplierId(e.target.value)}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100"
                  >
                    {activeSuppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.agencyName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Supplier Invoice No.</label>
                  <input
                    type="text"
                    value={grnSupplierInvNo}
                    onChange={e => setGrnSupplierInvNo(e.target.value)}
                    placeholder="INV-2026-991"
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Short-Expiry Alert (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={grnShortWarnDays}
                    onChange={e => setGrnShortWarnDays(Number(e.target.value))}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="flex flex-col justify-end gap-1.5 pb-1">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={grnAutoInvoice}
                      onChange={e => setGrnAutoInvoice(e.target.checked)}
                    />
                    <span>Recognize Bill on Post</span>
                  </label>
                  {canCorrectGrn && (
                    <label className="flex items-center gap-1.5 text-amber-800">
                      <input
                        type="checkbox"
                        checked={grnAllowOver}
                        onChange={e => setGrnAllowOver(e.target.checked)}
                      />
                      <span>Allow Over-Receipt</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                {grnLines.map((line, idx) => (
                  <div key={idx} className="p-3 border border-slate-200 rounded-xl space-y-2 bg-slate-50/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-slate-900">
                        {line.medicineName}
                        {line.pendingLimit !== undefined && (
                          <span className="ml-2 text-[11px] font-mono text-slate-500">
                            (PO Pending: {line.pendingLimit})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGrnLines(prev => [
                            ...prev,
                            { ...line, batchNumber: '', acceptedQuantity: 1, rejectedQuantity: 0 },
                          ]);
                        }}
                        className="text-[11px] font-semibold text-blue-700 hover:underline"
                      >
                        + Split Additional Batch
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-500 block">Batch No *</label>
                        <input
                          type="text"
                          required
                          value={line.batchNumber}
                          onChange={e =>
                            setGrnLines(prev => prev.map((x, i) => (i === idx ? { ...x, batchNumber: e.target.value } : x)))
                          }
                          placeholder="BT-2601"
                          className="w-full px-2 py-1.5 font-mono uppercase border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block">Expiry (YYYY-MM) *</label>
                        <input
                          type="text"
                          required
                          value={line.expiryDate}
                          onChange={e =>
                            setGrnLines(prev => prev.map((x, i) => (i === idx ? { ...x, expiryDate: e.target.value } : x)))
                          }
                          placeholder="2028-06"
                          className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block">Accepted Qty</label>
                        <input
                          type="number"
                          min="0"
                          value={line.acceptedQuantity}
                          onChange={e =>
                            setGrnLines(prev =>
                              prev.map((x, i) => (i === idx ? { ...x, acceptedQuantity: Number(e.target.value) } : x))
                            )
                          }
                          className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block">Rejected Qty</label>
                        <input
                          type="number"
                          min="0"
                          value={line.rejectedQuantity}
                          onChange={e =>
                            setGrnLines(prev =>
                              prev.map((x, i) => (i === idx ? { ...x, rejectedQuantity: Number(e.target.value) } : x))
                            )
                          }
                          className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block">PTR (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.purchasePrice}
                          onChange={e =>
                            setGrnLines(prev =>
                              prev.map((x, i) => (i === idx ? { ...x, purchasePrice: Number(e.target.value) } : x))
                            )
                          }
                          className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block">MRP (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.mrp}
                          onChange={e =>
                            setGrnLines(prev =>
                              prev.map((x, i) => (i === idx ? { ...x, mrp: Number(e.target.value) } : x))
                            )
                          }
                          className="w-full px-2 py-1.5 font-mono border border-slate-300 rounded bg-white"
                        />
                      </div>
                    </div>

                    {line.rejectedQuantity > 0 && (
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Rejection reason (e.g. Damaged strips / near-expiry)..."
                          value={line.rejectionReason}
                          onChange={e =>
                            setGrnLines(prev =>
                              prev.map((x, i) => (i === idx ? { ...x, rejectionReason: e.target.value } : x))
                            )
                          }
                          className="w-full px-2.5 py-1.5 border border-rose-300 rounded bg-white text-rose-800"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button type="button" onClick={() => setIsGrnModalOpen(false)} className="px-3 py-1.5 text-slate-600">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg">
                  Post GRN & Update Stock
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* PRINT PO MODAL */}
      {printPo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 border border-slate-200 text-xs">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">PURCHASE ORDER — {printPo.poNumber}</h3>
                <p className="text-slate-500">{store.name} · GSTIN: {store.gstin}</p>
              </div>
              <button onClick={() => setPrintPo(null)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 block">Supplier</span>
                <span className="font-bold">{printPo.supplierName}</span>
                <div className="font-mono text-slate-500">{printPo.supplierGstin}</div>
              </div>
              <div className="text-right">
                <span className="text-slate-500 block">Order Date</span>
                <span className="font-mono">{printPo.orderDate.slice(0, 10)}</span>
                <div className="font-semibold">{printPo.status}</div>
              </div>
            </div>
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-2">Medicine</th>
                  <th className="p-2 text-right font-mono">Qty</th>
                  <th className="p-2 text-right font-mono">PTR</th>
                  <th className="p-2 text-right font-mono">Tax</th>
                  <th className="p-2 text-right font-mono">Total</th>
                </tr>
              </thead>
              <tbody>
                {printPo.items.map(i => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="p-2">{i.medicineName}</td>
                    <td className="p-2 text-right font-mono">{i.orderedQuantity}</td>
                    <td className="p-2 text-right font-mono">₹{i.unitCost.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono">{i.gstRate}%</td>
                    <td className="p-2 text-right font-mono">₹{i.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right font-mono font-bold text-sm">
              Grand Total: ₹{printPo.grandTotal.toFixed(2)}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => window.print()} className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-semibold flex items-center gap-1">
                <Printer className="w-3.5 h-3.5" /> Print PO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PRINT GRN MODAL */}
      {printGrn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 space-y-4 border border-slate-200 text-xs">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">GOODS RECEIPT NOTE — {printGrn.grnNumber}</h3>
                <p className="text-slate-500">{store.name} · {printGrn.supplierName}</p>
              </div>
              <button onClick={() => setPrintGrn(null)}>
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <table className="w-full text-left border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-2">Medicine</th>
                  <th className="p-2 font-mono">Batch</th>
                  <th className="p-2 font-mono">Expiry</th>
                  <th className="p-2 text-right font-mono">Acc / Rej</th>
                  <th className="p-2 text-right font-mono">Total</th>
                </tr>
              </thead>
              <tbody>
                {printGrn.items.map(i => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="p-2">{i.medicineName}</td>
                    <td className="p-2 font-mono">{i.batchNumber}</td>
                    <td className="p-2 font-mono">{i.expiryDate}</td>
                    <td className="p-2 text-right font-mono">{i.acceptedQuantity} / {i.rejectedQuantity}</td>
                    <td className="p-2 text-right font-mono">₹{i.lineTotal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-2">
              <button onClick={() => window.print()} className="px-4 py-1.5 bg-slate-900 text-white rounded-lg font-semibold flex items-center gap-1">
                <Printer className="w-3.5 h-3.5" /> Print GRN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL PO / REVERSE GRN REASON MODAL */}
      {actionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <form onSubmit={handleActionReasonSubmit} className="bg-white rounded-xl max-w-md w-full p-5 space-y-3 border border-slate-200 text-xs">
            <h3 className="font-bold text-slate-900">
              {actionPrompt.mode === 'cancel_po' ? `Cancel ${actionPrompt.label}` : `Reverse ${actionPrompt.label}`}
            </h3>
            <textarea
              required
              minLength={3}
              rows={3}
              placeholder="Enter mandatory audit reason..."
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setActionPrompt(null)} className="px-3 py-1.5 text-slate-600">
                Close
              </button>
              <button type="submit" className="px-4 py-1.5 bg-rose-600 text-white font-semibold rounded-lg">
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RECOGNIZE SUPPLIER BILL MODAL */}
      {isInvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <form onSubmit={handleCreateInvoice} className="bg-white rounded-xl max-w-md w-full p-5 space-y-3 border border-slate-200 text-xs">
            <h3 className="font-bold text-slate-900">Recognize Supplier Invoice</h3>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier *</label>
              <select
                value={invSupplierId}
                onChange={e => setInvSupplierId(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.agencyName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Link Unbilled GRN (Optional)</label>
              <select
                value={invGrnId}
                onChange={e => setInvGrnId(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="">— Direct Expense Bill (No GRN) —</option>
                {goodsReceipts
                  .filter(g => g.status === 'POSTED' && !g.linkedInvoiceId)
                  .map(g => (
                    <option key={g.id} value={g.id}>
                      {g.grnNumber} (₹{g.grandTotal.toFixed(2)})
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Invoice No. *</label>
              <input
                type="text"
                required
                value={invNumber}
                onChange={e => setInvNumber(e.target.value)}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
            {!invGrnId && (
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bill Total (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  required
                  value={invDirectTotal}
                  onChange={e => setInvDirectTotal(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsInvModalOpen(false)} className="px-3 py-1.5 text-slate-600">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white font-semibold rounded-lg">
                Save Bill
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SUPPLIER RETURN MODAL */}
      {isReturnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <form onSubmit={handleCreateReturn} className="bg-white rounded-xl max-w-md w-full p-5 space-y-3 border border-slate-200 text-xs">
            <h3 className="font-bold text-slate-900">Return Stock to Supplier</h3>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Batch from GRN</label>
              <select
                value={retBatchId}
                onChange={e => setRetBatchId(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg bg-white"
              >
                {(goodsReceipts.find(g => g.id === retGrnId)?.items || [])
                  .filter(i => i.inventoryBatchId)
                  .map(i => {
                    const invBatch = inventory.find(b => b.id === i.inventoryBatchId);
                    return (
                      <option key={i.inventoryBatchId!} value={i.inventoryBatchId!}>
                        {i.medicineName} · {i.batchNumber} (Avail: {invBatch?.currentStock ?? 0})
                      </option>
                    );
                  })}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Return Quantity</label>
              <input
                type="number"
                min="1"
                required
                value={retQty}
                onChange={e => setRetQty(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Reason *</label>
              <input
                type="text"
                required
                minLength={3}
                value={retReason}
                onChange={e => setRetReason(e.target.value)}
                placeholder="Near-expiry return / supplier recall"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setIsReturnModalOpen(false)} className="px-3 py-1.5 text-slate-600">
                Cancel
              </button>
              <button type="submit" className="px-4 py-1.5 bg-amber-600 text-white font-semibold rounded-lg">
                Post Return & Credit Note
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
