/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  IndianRupee,
  Receipt,
  Package,
  AlertTriangle,
  Clock,
  Pill,
  Printer,
  ChevronRight,
  ShoppingBag,
  Ban,
  Wallet,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { getDaysToExpiry, isBatchExpired } from '../../lib/operatorHelpers.ts';

export const DashboardView: React.FC = () => {
  const {
    store,
    currentUser,
    navigateToModule,
    bills,
    inventory,
    medicines,
    customers,
    purchaseOrders,
    goodsReceipts,
    expiryWarningDays,
    activeBranch,
    consolidatedViewMode,
    setActiveQuickModal,
    setPrintInvoiceData,
    hasUserPermission,
  } = usePharmacy();

  const canCreateBill = hasUserPermission('billing.create');
  const canAddMedicine = hasUserPermission('medicines.create');
  const canReceiveStock = hasUserPermission('goods_receipts.post') || hasUserPermission('purchase_orders.view');
  const canCollectPayment =
    hasUserPermission('customers.khata_collect') || hasUserPermission('customers.khata_settle');
  const canViewBilling = hasUserPermission('billing.view');
  const canViewPurchases = hasUserPermission('purchase_orders.view') || hasUserPermission('goods_receipts.view');
  const canViewKhata = hasUserPermission('customers.khata_view');
  const isHelper = currentUser.role === 'helper';

  const metrics = useMemo(() => {
    const activeBills = bills.filter(b => b.status !== 'cancelled');
    const todaySales = activeBills.reduce((sum, b) => sum + b.grandTotal, 0);
    const totalBillsCount = activeBills.length;
    const paymentsCollected = activeBills.reduce((sum, b) => sum + (b.amountPaid || 0), 0);
    const pendingCustomerPayments = customers
      .filter(c => !c.isArchived && (c.khataBalance || 0) > 0)
      .reduce((sum, c) => sum + (c.khataBalance || 0), 0);
    const customersWithDueCount = customers.filter(c => !c.isArchived && (c.khataBalance || 0) > 0).length;

    // Low stock across active medicines (only counting non-expired stock)
    const stockByMed = new Map<string, number>();
    let totalSellablePacks = 0;
    let expiredBatchesCount = 0;
    let nearExpiryBatchesCount = 0;

    for (const batch of inventory) {
      if (batch.currentStock <= 0) continue;
      const expired = isBatchExpired(batch.expiryDate);
      if (expired) {
        expiredBatchesCount += 1;
        continue;
      }
      totalSellablePacks += batch.currentStock;
      stockByMed.set(batch.medicineId, (stockByMed.get(batch.medicineId) || 0) + batch.currentStock);

      const days = getDaysToExpiry(batch.expiryDate);
      if (days !== null && days > 0 && days <= (expiryWarningDays || 90)) {
        nearExpiryBatchesCount += 1;
      }
    }

    const lowStockMedsCount = medicines.filter(
      m => m.status !== 'archived' && (stockByMed.get(m.id) || 0) <= (m.minStockLevel || 15)
    ).length;

    const pendingPurchasesCount = purchaseOrders.filter(p =>
      ['PENDING_APPROVAL', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status)
    ).length;

    return {
      todaySales,
      totalBillsCount,
      paymentsCollected,
      pendingCustomerPayments,
      customersWithDueCount,
      totalSellablePacks,
      lowStockMedsCount,
      nearExpiryBatchesCount,
      expiredBatchesCount,
      pendingPurchasesCount,
    };
  }, [bills, customers, inventory, medicines, purchaseOrders, expiryWarningDays]);

  const branchLabel = consolidatedViewMode
    ? 'All Branches'
    : `${activeBranch?.name || store.branchName}`;

  const attentionItems = [
    {
      id: 'low_stock',
      label: 'Low-Stock Medicines',
      count: metrics.lowStockMedsCount,
      detail:
        metrics.lowStockMedsCount > 0
          ? `${metrics.lowStockMedsCount} medicine(s) need reorder`
          : 'All medicines above minimum level',
      tone: metrics.lowStockMedsCount > 0 ? 'amber' : 'neutral',
      actionLabel: 'Check & Reorder',
      onClick: () => navigateToModule('medicines', 'low_stock'),
      visible: true,
    },
    {
      id: 'near_expiry',
      label: 'Near-Expiry Batches',
      count: metrics.nearExpiryBatchesCount,
      detail:
        metrics.nearExpiryBatchesCount > 0
          ? `Expiring within ${expiryWarningDays || 90} days`
          : 'No batches expiring soon',
      tone: metrics.nearExpiryBatchesCount > 0 ? 'amber' : 'neutral',
      actionLabel: 'Review Expiry',
      onClick: () => navigateToModule('medicines', 'expiry'),
      visible: true,
    },
    {
      id: 'expired',
      label: 'Expired Stock (Blocked)',
      count: metrics.expiredBatchesCount,
      detail:
        metrics.expiredBatchesCount > 0
          ? 'Blocked from sale — remove from shelf'
          : 'No expired stock on shelves',
      tone: metrics.expiredBatchesCount > 0 ? 'red' : 'neutral',
      actionLabel: 'View Expired',
      onClick: () => navigateToModule('medicines', 'expired'),
      visible: true,
    },
    {
      id: 'pending_purchases',
      label: 'Pending Purchases',
      count: metrics.pendingPurchasesCount,
      detail:
        metrics.pendingPurchasesCount > 0
          ? 'Supplier orders waiting to be received'
          : 'No pending supplier deliveries',
      tone: metrics.pendingPurchasesCount > 0 ? 'blue' : 'neutral',
      actionLabel: 'Receive Stock',
      onClick: () => navigateToModule('purchases', 'receive'),
      visible: canViewPurchases,
    },
    {
      id: 'customer_dues',
      label: 'Customer Payments Due',
      count: metrics.customersWithDueCount,
      detail:
        metrics.customersWithDueCount > 0
          ? `₹${metrics.pendingCustomerPayments.toLocaleString('en-IN', { maximumFractionDigits: 0 })} waiting to be collected`
          : 'All customer accounts settled',
      tone: metrics.customersWithDueCount > 0 ? 'amber' : 'neutral',
      actionLabel: 'Collect Payment',
      onClick: () => navigateToModule('customers', 'pending'),
      visible: canViewKhata && !isHelper,
    },
  ].filter(item => item.visible);

  return (
    <div className="space-y-5">
      {/* Top Operator Greeting & Max-4 Quick Actions */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Good day, {currentUser.name}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {store.name} · {branchLabel} ·{' '}
            <span className="font-mono tabular-nums">{metrics.totalSellablePacks}</span> packs in active stock
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {canCreateBill && (
            <button
              type="button"
              onClick={() => navigateToModule('billing')}
              className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Receipt className="w-4 h-4" />
              <span>New Bill</span>
            </button>
          )}

          {canAddMedicine && (
            <button
              type="button"
              onClick={() => setActiveQuickModal('medicine')}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Pill className="w-4 h-4 text-blue-600" />
              <span>Add Medicine</span>
            </button>
          )}

          {canReceiveStock && (
            <button
              type="button"
              onClick={() => navigateToModule('purchases', 'receive')}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <ShoppingBag className="w-4 h-4 text-blue-600" />
              <span>Receive Stock</span>
            </button>
          )}

          {canCollectPayment && (
            <button
              type="button"
              onClick={() => navigateToModule('customers', 'collect')}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Wallet className="w-4 h-4 text-amber-600" />
              <span>Collect Payment</span>
            </button>
          )}

          {isHelper && (
            <button
              type="button"
              onClick={() => navigateToModule('medicines', 'stock')}
              className="px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap col-span-2"
            >
              <Package className="w-4 h-4" />
              <span>Check Medicines & Stock</span>
            </button>
          )}
        </div>
      </div>

      {/* Question 1: How is the store doing today? (Shown for counter/manager/auditor roles) */}
      {!isHelper && (
        <section aria-label="Today's Business">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 px-0.5">
            Today&apos;s Business
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">Today&apos;s Sales</span>
                <IndianRupee className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
                ₹{metrics.todaySales.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Total billed value</div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">Number of Bills</span>
                <Receipt className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
                {metrics.totalBillsCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                Avg ₹{Math.round(metrics.todaySales / (metrics.totalBillsCount || 1))} per bill
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">Payments Collected</span>
                <Wallet className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-2">
                ₹{metrics.paymentsCollected.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Cash, UPI & Card received</div>
            </div>

            <button
              type="button"
              onClick={() => canViewKhata && navigateToModule('customers', 'pending')}
              className="bg-white p-4 rounded-xl border border-slate-200 hover:border-amber-300 text-left transition-colors"
            >
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-medium">Customer Pending</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-xl sm:text-2xl font-bold text-amber-700 font-mono tabular-nums mt-2">
                {canViewKhata
                  ? `₹${metrics.pendingCustomerPayments.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
                  : '—'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {metrics.customersWithDueCount} customer(s) with balance due
              </div>
            </button>
          </div>
        </section>
      )}

      {/* Question 2: What needs attention right now? */}
      <section aria-label="Needs Attention">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 px-0.5">
          Needs Attention Now
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {attentionItems.map(item => (
            <div
              key={item.id}
              className={`bg-white p-4 rounded-xl border flex items-center justify-between gap-3 ${
                item.tone === 'red'
                  ? 'border-rose-200'
                  : item.tone === 'amber'
                  ? 'border-amber-200'
                  : item.tone === 'blue'
                  ? 'border-blue-200'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    item.tone === 'red'
                      ? 'bg-rose-50 text-rose-600'
                      : item.tone === 'amber'
                      ? 'bg-amber-50 text-amber-600'
                      : item.tone === 'blue'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {item.id === 'expired' ? (
                    <Ban className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 truncate">{item.label}</span>
                    <span
                      className={`font-mono tabular-nums text-xs font-bold ${
                        item.tone === 'red'
                          ? 'text-rose-700'
                          : item.tone === 'amber'
                          ? 'text-amber-700'
                          : item.tone === 'blue'
                          ? 'text-blue-700'
                          : 'text-slate-600'
                      }`}
                    >
                      {item.count}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{item.detail}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={item.onClick}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 whitespace-nowrap shrink-0"
              >
                {item.actionLabel}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Question 3: Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Latest Bills */}
        {canViewBilling && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Latest Bills</h2>
                <p className="text-[11px] text-slate-500">Recent counter sales and quick receipt print</p>
              </div>
              <button
                type="button"
                onClick={() => navigateToModule('billing', 'history')}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>All Bills</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {bills.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No bills created yet. Click New Bill to start selling.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {bills.slice(0, 5).map(bill => (
                  <div
                    key={bill.id}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/70"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-900">{bill.invoiceNumber}</span>
                        <span className="text-slate-600 truncate">{bill.customerName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {bill.items.length} item(s) ·{' '}
                        {bill.paymentMode === 'khata_credit' ? 'Customer Credit' : bill.paymentMode.toUpperCase()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <span className="text-xs font-mono tabular-nums font-bold text-slate-900">
                        ₹{bill.grandTotal.toFixed(2)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPrintInvoiceData(bill)}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-blue-700 hover:bg-blue-50"
                        title="Print Receipt"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Stock Receipts & Pending Orders */}
        <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${!canViewBilling ? 'lg:col-span-2' : ''}`}>
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {canViewPurchases ? 'Recent Purchases & Stock Receipts' : 'Fast Stock Summary'}
              </h2>
              <p className="text-[11px] text-slate-500">
                {canViewPurchases ? 'Supplier deliveries and open purchase orders' : 'Medicines ready for shelf check'}
              </p>
            </div>
            {canViewPurchases && (
              <button
                type="button"
                onClick={() => navigateToModule('purchases', 'receive')}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 whitespace-nowrap"
              >
                <span>Purchases</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canViewPurchases ? (
            goodsReceipts.length === 0 && purchaseOrders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No supplier receipts or orders yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {goodsReceipts.slice(0, 3).map(grn => (
                  <div key={grn.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        Stock Received · {grn.supplierName}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {grn.grnNumber} · {grn.totalAcceptedQty} pack(s) added
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-bold text-emerald-700 shrink-0">
                      ₹{grn.grandTotal.toFixed(0)}
                    </span>
                  </div>
                ))}
                {purchaseOrders
                  .filter(po => ['APPROVED', 'PARTIALLY_RECEIVED', 'PENDING_APPROVAL'].includes(po.status))
                  .slice(0, 2)
                  .map(po => (
                    <div key={po.id} className="px-4 py-3 flex items-center justify-between gap-3 bg-slate-50/40">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 truncate">
                          Order {po.poNumber} · {po.supplierName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {po.totalReceivedQty} of {po.totalOrderedQty} received
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigateToModule('purchases', 'receive')}
                        className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[11px] font-semibold shrink-0"
                      >
                        Receive
                      </button>
                    </div>
                  ))}
              </div>
            )
          ) : (
            <div className="p-5 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {metrics.lowStockMedsCount} medicines low on shelf · {metrics.nearExpiryBatchesCount} near expiry
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Open Medicines & Stock to check rack locations and batch expiry dates.
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigateToModule('medicines', 'stock')}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold shrink-0"
              >
                Open Stock
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
