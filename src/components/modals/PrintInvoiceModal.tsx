/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { X, Printer, CheckCircle, Share2 } from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';

export const PrintInvoiceModal: React.FC = () => {
  const { printInvoiceData, setPrintInvoiceData, store } = usePharmacy();
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!printInvoiceData) return null;

  const handlePrint = () => {
    window.print();
  };

  const invoice = printInvoiceData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-4 print:border-none print:shadow-none print:max-w-none print:w-full print:m-0">
        {/* Modal Top Actions (Hidden in print) */}
        <div className="px-6 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-bold text-slate-800">
              Tax Invoice Preview • {invoice.invoiceNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Invoice</span>
            </button>
            <button
              onClick={() => setPrintInvoiceData(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Container */}
        <div ref={printAreaRef} className="p-6 text-slate-900 font-sans text-xs bg-white">
          {/* Pharmacy Header */}
          <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
            <h2 className="text-base font-bold uppercase tracking-tight text-slate-900">
              {store.name}
            </h2>
            <p className="text-[11px] text-slate-600 font-medium">
              {store.address}, {store.city} - {store.pincode}
            </p>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              Ph: {store.phone} | GSTIN: {store.gstin}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">
              DL 20B: {store.dlNumber20B} | DL 21B: {store.dlNumber21B}
            </p>
            <div className="mt-1 text-[11px] font-bold text-slate-800 uppercase tracking-wider">
              RETAIL PHARMACY TAX INVOICE
            </div>
          </div>

          {/* Bill Meta */}
          <div className="grid grid-cols-2 gap-2 pb-2 mb-2 border-b border-dashed border-slate-200 text-[11px]">
            <div>
              <span className="text-slate-500">Invoice No:</span>{' '}
              <span className="font-mono font-bold text-slate-900">{invoice.invoiceNumber}</span>
              <br />
              <span className="text-slate-500">Date & Time:</span>{' '}
              <span className="font-mono text-slate-800">{invoice.timestamp}</span>
              <br />
              <span className="text-slate-500">Billed By:</span>{' '}
              <span className="text-slate-800">{invoice.cashierName}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500">Customer:</span>{' '}
              <span className="font-semibold text-slate-900">{invoice.customerName}</span>
              <br />
              <span className="text-slate-500">Mobile:</span>{' '}
              <span className="font-mono text-slate-800">{invoice.customerPhone || 'N/A'}</span>
              <br />
              {invoice.doctorName && (
                <>
                  <span className="text-slate-500">Prescribing Dr:</span>{' '}
                  <span className="text-slate-800 font-medium">{invoice.doctorName}</span>
                  {invoice.doctorRegNumber && (
                    <span className="text-[10px] text-slate-500 block font-mono">Reg: {invoice.doctorRegNumber}</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Itemized Table */}
          <table className="w-full text-left border-collapse text-[11px] my-2">
            <thead>
              <tr className="border-b border-slate-300 text-slate-600 font-semibold">
                <th className="py-1">Item & Salt</th>
                <th className="py-1 font-mono">Batch / Exp</th>
                <th className="py-1 text-center font-mono">Qty</th>
                <th className="py-1 text-right font-mono">MRP (₹)</th>
                <th className="py-1 text-right font-mono">Net (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.items.map((item, index) => {
                const itemTotal = (item.mrp * item.quantity * (1 - item.discountPercent / 100));
                return (
                  <tr key={index} className="align-top">
                    <td className="py-1.5 pr-2">
                      <div className="font-bold text-slate-900 leading-tight">
                        {item.brandName}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                        {item.saltComposition}
                      </div>
                      {item.schedule && item.schedule.startsWith('Schedule') && (
                        <span className="text-[9px] font-bold text-red-600 uppercase">
                          Rx · {item.schedule}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 font-mono text-[10px] text-slate-600">
                      <div>{item.batchNumber}</div>
                      <div>{item.expiryDate}</div>
                    </td>
                    <td className="py-1.5 text-center font-mono font-medium">
                      {item.quantity}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-slate-600">
                      {item.mrp.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums font-bold text-slate-900">
                      {itemTotal.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals Calculation */}
          <div className="border-t border-slate-300 pt-2 mt-2 space-y-1 text-right text-[11px]">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal (Gross MRP):</span>
              <span className="font-mono tabular-nums">₹{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.totalDiscount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Customer Discount:</span>
                <span className="font-mono tabular-nums">-₹{invoice.totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500 text-[10px]">
              <span>Taxable Value:</span>
              <span className="font-mono tabular-nums">₹{invoice.taxableAmount.toFixed(2)}</span>
            </div>
            {invoice.igst && invoice.igst > 0 ? (
              <div className="flex justify-between text-slate-500 text-[10px]">
                <span>IGST (Inter-state):</span>
                <span className="font-mono tabular-nums">₹{invoice.igst.toFixed(2)}</span>
              </div>
            ) : (
              <>
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>CGST:</span>
                  <span className="font-mono tabular-nums">₹{invoice.cgst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>SGST:</span>
                  <span className="font-mono tabular-nums">₹{invoice.sgst.toFixed(2)}</span>
                </div>
              </>
            )}
            {invoice.roundOff !== 0 && (
              <div className="flex justify-between text-slate-400 text-[10px]">
                <span>Round-off:</span>
                <span className="font-mono tabular-nums">₹{invoice.roundOff.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold border-t border-slate-900 pt-1.5 text-slate-900">
              <span>NET PAYABLE:</span>
              <span className="font-mono tabular-nums text-base">₹{invoice.grandTotal.toFixed(2)}</span>
            </div>
            <div className="text-[10px] text-slate-500 text-left pt-1">
              Payment Mode:{' '}
              <span className="font-semibold uppercase text-slate-800">
                {invoice.paymentMode === 'khata_credit' ? 'Credit (Khata Account)' : invoice.paymentMode}
              </span>
            </div>
          </div>

          {/* Statutory Warnings */}
          <div className="border-t border-dashed border-slate-200 mt-3 pt-2 text-[9px] text-slate-500 text-center leading-normal">
            <p className="font-semibold text-slate-700">
              * Schedule H/H1 Warning: To be sold by retail on prescription only.
            </p>
            <p>Medicines once sold will not be accepted back without original cash memo.</p>
            <p className="font-medium text-slate-700 mt-1">Thank you for visiting {store.name}!</p>
          </div>
        </div>
      </div>
    </div>
  );
};
