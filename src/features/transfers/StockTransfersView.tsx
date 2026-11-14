/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Eye,
  PackageCheck,
  Plus,
  Printer,
  Search,
  Send,
  ShieldAlert,
  Truck,
  X,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import type { StockTransfer } from '../../types/pharmacy.ts';

const formatInr = (value: number): string =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

type TransferFilterTab = 'ALL' | 'OUTBOUND' | 'INBOUND' | 'PENDING_APPROVAL' | 'IN_TRANSIT' | 'DISCREPANCIES';

export const StockTransfersView: React.FC = () => {
  const {
    store,
    branches,
    activeBranchId,
    allInventory,
    stockTransfers,
    hasUserPermission,
    createStockTransfer,
    submitStockTransfer,
    approveStockTransfer,
    rejectStockTransfer,
    cancelStockTransfer,
    dispatchStockTransfer,
    receiveStockTransfer,
    reconcileStockTransfer,
  } = usePharmacy();

  const canView = hasUserPermission('stock_transfers.view');
  const canCreate = hasUserPermission('stock_transfers.create');
  const canSubmit = hasUserPermission('stock_transfers.submit');
  const canApprove = hasUserPermission('stock_transfers.approve');
  const canReject = hasUserPermission('stock_transfers.reject');
  const canDispatch = hasUserPermission('stock_transfers.dispatch');
  const canReceive = hasUserPermission('stock_transfers.receive');
  const canCancel = hasUserPermission('stock_transfers.cancel');
  const canReconcile = hasUserPermission('stock_transfers.reconcile');

  const [filterTab, setFilterTab] = useState<TransferFilterTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [srcBranchId, setSrcBranchId] = useState<string>(activeBranchId || 'main');
  const [dstBranchId, setDstBranchId] = useState<string>(
    branches.find(b => b.id !== (activeBranchId || 'main') && b.status === 'ACTIVE')?.id || 'br_opd_02'
  );
  const [transferNotes, setTransferNotes] = useState('');
  const [submitImmediately, setSubmitImmediately] = useState(true);
  const [draftLines, setDraftLines] = useState<Array<{ batchId: string; quantity: number }>>([
    { batchId: '', quantity: 1 },
  ]);

  // Detail / Workflow Modals
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [dispatchModalTransfer, setDispatchModalTransfer] = useState<StockTransfer | null>(null);
  const [dispatchRef, setDispatchRef] = useState('');
  const [transporter, setTransporter] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [dispatchQtys, setDispatchQtys] = useState<Record<string, number>>({});

  const [receiveModalTransfer, setReceiveModalTransfer] = useState<StockTransfer | null>(null);
  const [receiveLines, setReceiveLines] = useState<
    Record<string, { received: number; damaged: number; missing: number; reason: string }>
  >({});

  const [reasonModal, setReasonModal] = useState<{
    transfer: StockTransfer;
    action: 'reject' | 'cancel' | 'reconcile';
  } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const [challanTransfer, setChallanTransfer] = useState<StockTransfer | null>(null);

  const activeBranches = useMemo(() => branches.filter(b => b.status === 'ACTIVE'), [branches]);

  const sourceBranchBatches = useMemo(
    () =>
      allInventory.filter(
        b => (b.branchId || 'main') === srcBranchId && b.currentStock > 0 && b.status !== 'expired'
      ),
    [allInventory, srcBranchId]
  );

  const filteredTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stockTransfers.filter(t => {
      if (filterTab === 'OUTBOUND' && t.sourceBranchId !== activeBranchId) return false;
      if (filterTab === 'INBOUND' && t.destinationBranchId !== activeBranchId) return false;
      if (filterTab === 'PENDING_APPROVAL' && t.status !== 'PENDING_APPROVAL') return false;
      if (filterTab === 'IN_TRANSIT' && !['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(t.status))
        return false;
      if (filterTab === 'DISCREPANCIES' && !t.hasDiscrepancies) return false;

      if (q) {
        const hitNumber = t.transferNumber.toLowerCase().includes(q);
        const hitBranch =
          t.sourceBranchName.toLowerCase().includes(q) ||
          t.destinationBranchName.toLowerCase().includes(q) ||
          t.sourceBranchCode.toLowerCase().includes(q) ||
          t.destinationBranchCode.toLowerCase().includes(q);
        const hitBatch = t.items.some(
          i => i.batchNumber.toLowerCase().includes(q) || i.medicineName.toLowerCase().includes(q)
        );
        if (!hitNumber && !hitBranch && !hitBatch) return false;
      }
      return true;
    });
  }, [stockTransfers, filterTab, activeBranchId, searchQuery]);

  const pendingApprovalCount = stockTransfers.filter(t => t.status === 'PENDING_APPROVAL').length;
  const inTransitTransfers = stockTransfers.filter(t =>
    ['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(t.status)
  );
  const inTransitUnits = inTransitTransfers.reduce(
    (s, t) => s + Math.max(0, t.totalDispatchedQty - t.totalReceivedQty - t.totalDamagedQty - t.totalMissingQty),
    0
  );
  const discrepancyCount = stockTransfers.filter(t => t.hasDiscrepancies).length;

  if (!canView) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-10">
        <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Stock Transfers Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">
          Inter-branch transfers require <span className="font-mono text-xs">stock_transfers.view</span> permission.
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    const initialSrc = activeBranches.some(b => b.id === activeBranchId)
      ? activeBranchId
      : activeBranches[0]?.id || 'main';
    const initialDst = activeBranches.find(b => b.id !== initialSrc)?.id || '';
    setSrcBranchId(initialSrc);
    setDstBranchId(initialDst);
    setTransferNotes('');
    setSubmitImmediately(true);
    setDraftLines([{ batchId: '', quantity: 1 }]);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const itemsPayload: Array<{ medicineId: string; sourceBatchId: string; requestedQuantity: number }> = [];
    for (const line of draftLines) {
      if (!line.batchId) continue;
      const batch = sourceBranchBatches.find(b => b.id === line.batchId);
      if (!batch) continue;
      itemsPayload.push({
        medicineId: batch.medicineId,
        sourceBatchId: batch.id,
        requestedQuantity: Number(line.quantity) || 1,
      });
    }
    if (itemsPayload.length === 0) {
      setFeedback({ type: 'error', text: 'Select at least one valid source batch and quantity.' });
      return;
    }
    const res = await createStockTransfer({
      sourceBranchId: srcBranchId,
      destinationBranchId: dstBranchId,
      notes: transferNotes || undefined,
      submitImmediately,
      items: itemsPayload,
    });
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Failed to create transfer' });
      return;
    }
    setIsCreateOpen(false);
    setFeedback({
      type: 'success',
      text: `Transfer ${res.transfer?.transferNumber} created (${res.transfer?.status}).`,
    });
  };

  const openDispatchModal = (t: StockTransfer) => {
    const initial: Record<string, number> = {};
    for (const item of t.items) {
      const remaining = Math.max(0, (item.approvedQuantity || item.requestedQuantity) - item.dispatchedQuantity);
      initial[item.id] = remaining;
    }
    setDispatchQtys(initial);
    setDispatchRef(t.dispatchReference || `CHLN-${t.transferNumber.slice(-4)}`);
    setTransporter(t.transporterName || 'Internal Van Courier');
    setVehicleNo(t.vehicleNumber || '');
    setDispatchModalTransfer(t);
  };

  const handleConfirmDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dispatchModalTransfer) return;
    const res = await dispatchStockTransfer(dispatchModalTransfer.id, {
      dispatchReference: dispatchRef || undefined,
      transporterName: transporter || undefined,
      vehicleNumber: vehicleNo || undefined,
      items: dispatchModalTransfer.items
        .map(i => ({ itemId: i.id, dispatchQuantity: Number(dispatchQtys[i.id] || 0) }))
        .filter(i => i.dispatchQuantity > 0),
    });
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Dispatch failed' });
      return;
    }
    setDispatchModalTransfer(null);
    setSelectedTransfer(res.transfer || null);
    setFeedback({
      type: 'success',
      text: `Transfer ${res.transfer?.transferNumber} dispatched into Stock-in-Transit (GL 1450).`,
    });
  };

  const openReceiveModal = (t: StockTransfer) => {
    const init: Record<string, { received: number; damaged: number; missing: number; reason: string }> = {};
    for (const item of t.items) {
      const pending = Math.max(
        0,
        item.dispatchedQuantity - (item.receivedQuantity + item.damagedQuantity + item.missingQuantity)
      );
      init[item.id] = { received: pending, damaged: 0, missing: 0, reason: '' };
    }
    setReceiveLines(init);
    setReceiveModalTransfer(t);
  };

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveModalTransfer) return;
    const payloadItems = receiveModalTransfer.items.map(i => {
      const row = receiveLines[i.id] || { received: 0, damaged: 0, missing: 0, reason: '' };
      return {
        itemId: i.id,
        receivedQuantity: Number(row.received) || 0,
        damagedQuantity: Number(row.damaged) || 0,
        missingQuantity: Number(row.missing) || 0,
        discrepancyReason: row.reason.trim() || undefined,
      };
    });
    const res = await receiveStockTransfer(receiveModalTransfer.id, { items: payloadItems });
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Receipt failed' });
      return;
    }
    setReceiveModalTransfer(null);
    setSelectedTransfer(res.transfer || null);
    setFeedback({
      type: 'success',
      text: `Stock receipt posted for ${res.transfer?.transferNumber} (${res.transfer?.status}).`,
    });
  };

  const handleReasonConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal) return;
    if (!reasonInput.trim()) return;
    let res: { ok: boolean; error?: string; transfer?: StockTransfer };
    if (reasonModal.action === 'reject') {
      res = await rejectStockTransfer(reasonModal.transfer.id, reasonInput.trim());
    } else if (reasonModal.action === 'cancel') {
      res = await cancelStockTransfer(reasonModal.transfer.id, reasonInput.trim());
    } else {
      res = await reconcileStockTransfer(reasonModal.transfer.id, reasonInput.trim());
    }
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Operation failed' });
      return;
    }
    setReasonModal(null);
    setReasonInput('');
    setSelectedTransfer(res.transfer || null);
    setFeedback({ type: 'success', text: `Transfer ${reasonModal.transfer.transferNumber} updated.` });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Inter-Branch Stock Transfers</h1>
          <p className="text-xs text-slate-600 mt-1">
            Batch-accurate inventory movement across pharmacy branches at PTR valuation with zero inter-branch revenue inflation.
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shrink-0 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New Stock Transfer</span>
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">Pending Approval</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-1">{pendingApprovalCount}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Awaiting branch review</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">In-Transit Shipments</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-blue-700 mt-1">{inTransitTransfers.length}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Dispatched awaiting receipt</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">Units In Transit</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">{inTransitUnits}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Booked under GL 1450</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">Discrepancies Logged</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-700 mt-1">{discrepancyCount}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Damaged or short receipts</span>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(
            [
              { id: 'ALL', label: 'All Transfers' },
              { id: 'OUTBOUND', label: 'Outbound' },
              { id: 'INBOUND', label: 'Inbound' },
              { id: 'PENDING_APPROVAL', label: 'Pending Approval' },
              { id: 'IN_TRANSIT', label: 'In-Transit' },
              { id: 'DISCREPANCIES', label: 'Discrepancies' },
            ] as const
          ).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilterTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filterTab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search TRF#, batch#, branch..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Transfers Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-3">Transfer #</th>
                <th className="px-4 py-3">Route (From → To)</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Req / Disp / Rec</th>
                <th className="px-4 py-3 text-right">PTR Value (₹)</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransfers.map(t => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-mono font-bold text-slate-900">{t.transferNumber}</div>
                    <div className="text-[11px] text-slate-500">{t.items.length} batch line(s)</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <span className="font-mono">{t.sourceBranchCode}</span>
                      <ArrowLeftRight className="w-3 h-3 text-slate-400" />
                      <span className="font-mono">{t.destinationBranchCode}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate max-w-[260px]">
                      {t.sourceBranchName} → {t.destinationBranchName}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">{t.transferDate}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                    {t.totalRequestedQty} / {t.totalDispatchedQty} / {t.totalReceivedQty}
                    {(t.totalDamagedQty > 0 || t.totalMissingQty > 0) && (
                      <div className="text-[11px] text-rose-700 font-semibold">
                        -{t.totalDamagedQty} dmg · -{t.totalMissingQty} mis
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                    {formatInr(t.totalValuationPtr)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-semibold ${
                        t.status === 'RECEIVED' || t.status === 'CLOSED'
                          ? 'text-emerald-700'
                          : t.status === 'IN_TRANSIT' || t.status === 'PARTIALLY_RECEIVED'
                          ? 'text-blue-700'
                          : t.status === 'REJECTED' || t.status === 'CANCELLED'
                          ? 'text-rose-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setSelectedTransfer(t)}
                        className="px-2 py-1 border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Details</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setChallanTransfer(t)}
                        className="p-1.5 border border-slate-200 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                        title="Print Transfer Challan"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      {t.status === 'DRAFT' && canSubmit && (
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await submitStockTransfer(t.id);
                            if (!r.ok) setFeedback({ type: 'error', text: r.error || 'Submit failed' });
                          }}
                          className="px-2.5 py-1 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          <span>Submit</span>
                        </button>
                      )}

                      {t.status === 'PENDING_APPROVAL' && canApprove && (
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await approveStockTransfer(t.id);
                            if (!r.ok) setFeedback({ type: 'error', text: r.error || 'Approval failed' });
                          }}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded-md font-semibold hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                      )}

                      {['APPROVED', 'DISPATCHED', 'IN_TRANSIT'].includes(t.status) &&
                        t.items.some(i => (i.approvedQuantity || i.requestedQuantity) > i.dispatchedQuantity) &&
                        canDispatch && (
                          <button
                            type="button"
                            onClick={() => openDispatchModal(t)}
                            className="px-2.5 py-1 bg-slate-900 text-white rounded-md font-semibold hover:bg-slate-800 inline-flex items-center gap-1"
                          >
                            <Truck className="w-3 h-3" />
                            <span>Dispatch</span>
                          </button>
                        )}

                      {['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(t.status) && canReceive && (
                        <button
                          type="button"
                          onClick={() => openReceiveModal(t)}
                          className="px-2.5 py-1 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700 inline-flex items-center gap-1"
                        >
                          <PackageCheck className="w-3 h-3" />
                          <span>Receive</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredTransfers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No stock transfers match your active filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Transfer Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Create Inter-Branch Stock Transfer</h2>
              <button type="button" onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Source Branch (Dispatching) *</label>
                  <select
                    value={srcBranchId}
                    onChange={e => {
                      const nextSrc = e.target.value;
                      setSrcBranchId(nextSrc);
                      if (nextSrc === dstBranchId) {
                        const alt = activeBranches.find(b => b.id !== nextSrc)?.id || '';
                        setDstBranchId(alt);
                      }
                      setDraftLines([{ batchId: '', quantity: 1 }]);
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    {activeBranches.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.branchCode} — {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Destination Branch (Receiving) *</label>
                  <select
                    value={dstBranchId}
                    onChange={e => setDstBranchId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    {activeBranches
                      .filter(b => b.id !== srcBranchId)
                      .map(b => (
                        <option key={b.id} value={b.id}>
                          {b.branchCode} — {b.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">Batches to Transfer (Expired Batches Excluded)</label>
                  <button
                    type="button"
                    onClick={() => setDraftLines(prev => [...prev, { batchId: '', quantity: 1 }])}
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    + Add Line
                  </button>
                </div>

                {draftLines.map((line, idx) => {
                  const chosenBatch = sourceBranchBatches.find(b => b.id === line.batchId);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center border border-slate-200 rounded-lg p-2.5">
                      <div className="col-span-7">
                        <select
                          required
                          value={line.batchId}
                          onChange={e =>
                            setDraftLines(prev =>
                              prev.map((row, i) => (i === idx ? { ...row, batchId: e.target.value } : row))
                            )
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md bg-white"
                        >
                          <option value="">Select source batch...</option>
                          {sourceBranchBatches.map(b => (
                            <option key={b.id} value={b.id}>
                              {b.brandName} · Batch {b.batchNumber} (Exp {b.expiryDate}) · Avail: {b.currentStock} · PTR ₹{b.ptr}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min={1}
                          max={chosenBatch?.currentStock || 9999}
                          value={line.quantity}
                          onChange={e =>
                            setDraftLines(prev =>
                              prev.map((row, i) => (i === idx ? { ...row, quantity: Number(e.target.value) } : row))
                            )
                          }
                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono text-right"
                        />
                      </div>
                      <div className="col-span-2 text-right font-mono tabular-nums text-slate-700">
                        {chosenBatch ? formatInr(chosenBatch.ptr * (Number(line.quantity) || 0)) : '₹0.00'}
                      </div>
                      <div className="col-span-1 text-right">
                        {draftLines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDraftLines(prev => prev.filter((_, i) => i !== idx))}
                            className="text-rose-600 hover:text-rose-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Transfer Notes</label>
                <input
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  placeholder="OPD counter weekly replenishment"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <label className="flex items-center gap-2 text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={submitImmediately}
                  onChange={e => setSubmitImmediately(e.target.checked)}
                />
                <span>Submit immediately (auto-approves if below branch policy threshold)</span>
              </label>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                >
                  {submitImmediately ? 'Create & Submit' : 'Save Draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Details Modal */}
      {selectedTransfer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-mono">
                  {selectedTransfer.transferNumber} · {selectedTransfer.status}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedTransfer.sourceBranchName} ({selectedTransfer.sourceBranchCode}) →{' '}
                  {selectedTransfer.destinationBranchName} ({selectedTransfer.destinationBranchCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransfer(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="border border-slate-200 rounded-lg p-2.5">
                  <span className="text-slate-500 block">Total PTR Valuation</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {formatInr(selectedTransfer.totalValuationPtr)}
                  </span>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5">
                  <span className="text-slate-500 block">In-Transit GL 1450</span>
                  <span className="font-mono font-bold text-blue-700 text-sm">
                    {formatInr(selectedTransfer.inTransitValuationPtr)}
                  </span>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5">
                  <span className="text-slate-500 block">Dispatch Ref</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {selectedTransfer.dispatchReference || '—'}
                  </span>
                </div>
                <div className="border border-slate-200 rounded-lg p-2.5">
                  <span className="text-slate-500 block">Transporter / Vehicle</span>
                  <span className="font-semibold text-slate-900 truncate block">
                    {selectedTransfer.transporterName || '—'}{' '}
                    {selectedTransfer.vehicleNumber ? `(${selectedTransfer.vehicleNumber})` : ''}
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Medicine &amp; Batch</th>
                      <th className="px-3 py-2">Exp</th>
                      <th className="px-3 py-2 text-right">Req</th>
                      <th className="px-3 py-2 text-right">Disp</th>
                      <th className="px-3 py-2 text-right">Rec</th>
                      <th className="px-3 py-2 text-right">Dmg/Mis</th>
                      <th className="px-3 py-2 text-right">PTR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedTransfer.items.map(item => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <div className="font-semibold text-slate-900">{item.medicineName}</div>
                          <div className="font-mono text-[11px] text-slate-500">Batch: {item.batchNumber}</div>
                          {item.discrepancyReason && (
                            <div className="text-[11px] text-rose-700 mt-0.5">
                              Reason: {item.discrepancyReason}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono">{item.expiryDate}</td>
                        <td className="px-3 py-2 text-right font-mono">{item.requestedQuantity}</td>
                        <td className="px-3 py-2 text-right font-mono">{item.dispatchedQuantity}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-700 font-semibold">
                          {item.receivedQuantity}
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-rose-700">
                          {item.damagedQuantity} / {item.missingQuantity}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatInr(item.unitCostPtr)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200">
                <div className="flex flex-wrap gap-2">
                  {selectedTransfer.status === 'PENDING_APPROVAL' && canReject && (
                    <button
                      type="button"
                      onClick={() => {
                        setReasonModal({ transfer: selectedTransfer, action: 'reject' });
                        setReasonInput('');
                      }}
                      className="px-3 py-1.5 border border-rose-200 text-rose-700 rounded-lg font-semibold hover:bg-rose-50"
                    >
                      Reject
                    </button>
                  )}
                  {['DRAFT', 'REQUESTED', 'PENDING_APPROVAL', 'APPROVED'].includes(selectedTransfer.status) &&
                    selectedTransfer.totalDispatchedQty === 0 &&
                    canCancel && (
                      <button
                        type="button"
                        onClick={() => {
                          setReasonModal({ transfer: selectedTransfer, action: 'cancel' });
                          setReasonInput('');
                        }}
                        className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-50"
                      >
                        Cancel Transfer
                      </button>
                    )}
                  {selectedTransfer.status === 'RECEIVED' && canReconcile && (
                    <button
                      type="button"
                      onClick={() => {
                        setReasonModal({ transfer: selectedTransfer, action: 'reconcile' });
                        setReasonInput('');
                      }}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg font-semibold hover:bg-slate-800 inline-flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Reconcile &amp; Close</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setChallanTransfer(selectedTransfer)}
                  className="px-3 py-1.5 border border-slate-200 text-slate-700 rounded-lg font-semibold hover:bg-slate-50 inline-flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Transfer Challan</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Modal */}
      {dispatchModalTransfer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Dispatch Stock · {dispatchModalTransfer.transferNumber}
              </h2>
              <button
                type="button"
                onClick={() => setDispatchModalTransfer(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmDispatch} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Challan / Dispatch Ref</label>
                  <input
                    value={dispatchRef}
                    onChange={e => setDispatchRef(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Courier / Handler</label>
                  <input
                    value={transporter}
                    onChange={e => setTransporter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Vehicle Number</label>
                  <input
                    value={vehicleNo}
                    onChange={e => setVehicleNo(e.target.value)}
                    placeholder="MH-02-CR-4821"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                    <tr>
                      <th className="px-3 py-2">Medicine &amp; Batch</th>
                      <th className="px-3 py-2 text-right">Remaining Approved</th>
                      <th className="px-3 py-2 text-right">Dispatch Now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dispatchModalTransfer.items.map(item => {
                      const remaining = Math.max(
                        0,
                        (item.approvedQuantity || item.requestedQuantity) - item.dispatchedQuantity
                      );
                      return (
                        <tr key={item.id}>
                          <td className="px-3 py-2">
                            <div className="font-semibold text-slate-900">{item.medicineName}</div>
                            <div className="font-mono text-[11px] text-slate-500">Batch: {item.batchNumber}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-mono">{remaining}</td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={0}
                              max={remaining}
                              value={dispatchQtys[item.id] ?? 0}
                              onChange={e =>
                                setDispatchQtys(prev => ({ ...prev, [item.id]: Number(e.target.value) }))
                              }
                              className="w-24 px-2 py-1 border border-slate-200 rounded-md font-mono text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDispatchModalTransfer(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold">
                  Confirm Dispatch (Debit 1450)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive & Discrepancy Inspection Modal */}
      {receiveModalTransfer && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Receive &amp; Inspect Stock · {receiveModalTransfer.transferNumber}
              </h2>
              <button
                type="button"
                onClick={() => setReceiveModalTransfer(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmReceive} className="p-5 space-y-4 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700">
                Destination receipt validates <span className="font-mono font-semibold">Accepted + Damaged + Missing &le; Pending Dispatched</span>.
                Any damaged or missing units require an audit reason and post to GL 5280 Shrinkage &amp; Spoilage.
              </div>

              <div className="space-y-3">
                {receiveModalTransfer.items.map(item => {
                  const pending = Math.max(
                    0,
                    item.dispatchedQuantity - (item.receivedQuantity + item.damagedQuantity + item.missingQuantity)
                  );
                  if (pending === 0) return null;
                  const row = receiveLines[item.id] || { received: 0, damaged: 0, missing: 0, reason: '' };
                  const sum = row.received + row.damaged + row.missing;
                  const over = sum > pending;
                  const needsReason = row.damaged > 0 || row.missing > 0;
                  return (
                    <div key={item.id} className="border border-slate-200 rounded-lg p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-slate-900">{item.medicineName}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            Batch: {item.batchNumber} · Exp {item.expiryDate}
                          </div>
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-slate-500">Pending In-Transit: </span>
                          <strong className="text-slate-900">{pending}</strong>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Accepted Good Qty</label>
                          <input
                            type="number"
                            min={0}
                            max={pending}
                            value={row.received}
                            onChange={e =>
                              setReceiveLines(prev => ({
                                ...prev,
                                [item.id]: { ...row, received: Number(e.target.value) },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Damaged Qty</label>
                          <input
                            type="number"
                            min={0}
                            max={pending}
                            value={row.damaged}
                            onChange={e =>
                              setReceiveLines(prev => ({
                                ...prev,
                                [item.id]: { ...row, damaged: Number(e.target.value) },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-slate-700 mb-1">Missing Qty</label>
                          <input
                            type="number"
                            min={0}
                            max={pending}
                            value={row.missing}
                            onChange={e =>
                              setReceiveLines(prev => ({
                                ...prev,
                                [item.id]: { ...row, missing: Number(e.target.value) },
                              }))
                            }
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono"
                          />
                        </div>
                      </div>

                      {over && (
                        <div className="text-rose-700 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Total accounted ({sum}) exceeds pending dispatched ({pending}).</span>
                        </div>
                      )}

                      {needsReason && (
                        <div>
                          <label className="block font-semibold text-rose-700 mb-1">Discrepancy Audit Reason *</label>
                          <input
                            required
                            value={row.reason}
                            onChange={e =>
                              setReceiveLines(prev => ({
                                ...prev,
                                [item.id]: { ...row, reason: e.target.value },
                              }))
                            }
                            placeholder="Broken glass vial / crushed outer carton during transit"
                            className="w-full px-2.5 py-1.5 border border-rose-200 rounded-md"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReceiveModalTransfer(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                  Post Receipt to {receiveModalTransfer.destinationBranchCode}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reason Modal for Reject / Cancel / Reconcile */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 capitalize">
                {reasonModal.action} Transfer · {reasonModal.transfer.transferNumber}
              </h2>
              <button type="button" onClick={() => setReasonModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleReasonConfirm} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Mandatory Audit Notes / Reason *</label>
                <textarea
                  required
                  rows={3}
                  value={reasonInput}
                  onChange={e => setReasonInput(e.target.value)}
                  placeholder="Provide reason for audit trail..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReasonModal(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold">
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Stock Transfer Challan Overlay */}
      {challanTransfer && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5 text-xs">
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">INTERNAL STOCK TRANSFER CHALLAN</h2>
                <p className="text-slate-600 mt-0.5">
                  {store.name} · Same-Entity Internal Branch Movement (Non-Taxable Supply)
                </p>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold text-sm text-slate-900">{challanTransfer.transferNumber}</div>
                <div className="text-slate-500">Date: {challanTransfer.transferDate}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-3">
                <span className="text-[11px] font-semibold text-slate-500 block">Dispatching Branch</span>
                <div className="font-bold text-slate-900 mt-0.5">
                  {challanTransfer.sourceBranchName} ({challanTransfer.sourceBranchCode})
                </div>
                <div className="text-slate-600 font-mono mt-0.5">DL: {store.dlNumber20B}</div>
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <span className="text-[11px] font-semibold text-slate-500 block">Receiving Branch</span>
                <div className="font-bold text-slate-900 mt-0.5">
                  {challanTransfer.destinationBranchName} ({challanTransfer.destinationBranchCode})
                </div>
                <div className="text-slate-600 font-mono mt-0.5">Ref: {challanTransfer.dispatchReference || 'Pending'}</div>
              </div>
            </div>

            <table className="w-full border-collapse border border-slate-200">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="border border-slate-200 px-2.5 py-2 text-left">Medicine</th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left">Batch #</th>
                  <th className="border border-slate-200 px-2.5 py-2 text-left">Expiry</th>
                  <th className="border border-slate-200 px-2.5 py-2 text-right">Qty</th>
                  <th className="border border-slate-200 px-2.5 py-2 text-right">PTR (₹)</th>
                  <th className="border border-slate-200 px-2.5 py-2 text-right">Valuation (₹)</th>
                </tr>
              </thead>
              <tbody>
                {challanTransfer.items.map(item => {
                  const qty = item.dispatchedQuantity || item.approvedQuantity || item.requestedQuantity;
                  return (
                    <tr key={item.id}>
                      <td className="border border-slate-200 px-2.5 py-1.5 font-medium">{item.medicineName}</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 font-mono">{item.batchNumber}</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 font-mono">{item.expiryDate}</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right font-mono">{qty}</td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right font-mono">
                        {formatInr(item.unitCostPtr)}
                      </td>
                      <td className="border border-slate-200 px-2.5 py-1.5 text-right font-mono font-semibold">
                        {formatInr(qty * item.unitCostPtr)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-bold">
                  <td colSpan={5} className="border border-slate-200 px-2.5 py-2 text-right">
                    Total Stock Transfer Value (PTR Cost Basis)
                  </td>
                  <td className="border border-slate-200 px-2.5 py-2 text-right font-mono">
                    {formatInr(challanTransfer.totalValuationPtr)}
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setChallanTransfer(null)}
                className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Challan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
