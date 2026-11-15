/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Receipt,
  User,
  Phone,
  Stethoscope,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  CreditCard,
  Wallet,
  Building,
  Clock,
  Printer,
  RotateCcw,
  Barcode,
  Layers,
  ArrowRightLeft,
  X,
  FileText,
  DollarSign,
  Undo2,
  ShieldAlert,
  UserPlus,
  ShieldCheck,
  BookOpen,
  Ban,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  CartItem,
  PaymentMode,
  ScheduleCategory,
  BillInvoice,
  PaymentRecord,
  Customer,
  CustomerAccount,
} from '../../types/pharmacy.ts';
import {
  customerApi,
  ApiClientError,
  generateIdempotencyKey,
} from '../../lib/customerApi.ts';
import {
  isBatchExpired,
  searchSellableMedicines,
  SearchableBillingEntry,
} from '../../lib/operatorHelpers.ts';

const maskPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '******';
  return `******${digits.slice(-4)}`;
};

export const BillingView: React.FC = () => {
  const {
    inventory,
    medicines,
    customers,
    store,
    currentUser,
    apiSession,
    bills,
    createBill,
    cancelBill,
    processSalesReturn,
    recordBillPayment,
    setPrintInvoiceData,
    setActiveQuickModal,
    hasUserPermission,
    moduleSubTab,
    setModuleSubTab,
  } = usePharmacy();

  const canViewPhone = hasUserPermission('customers.view_phone');
  const canOverrideCredit = hasUserPermission('customers.credit_override');
  const isLiveApi = Boolean(apiSession.bearerToken);

  // Tab State: 'terminal' (New Bill) vs 'history' (Bill History)
  const [activeTab, setActiveTab] = useState<'terminal' | 'history'>(
    moduleSubTab === 'history' ? 'history' : 'terminal'
  );

  useEffect(() => {
    if (moduleSubTab === 'history') {
      setActiveTab('history');
      setModuleSubTab(null);
    } else if (moduleSubTab === 'terminal') {
      setActiveTab('terminal');
      setModuleSubTab(null);
    }
  }, [moduleSubTab, setModuleSubTab]);

  // Search & Scanner states
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScannerMode, setIsScannerMode] = useState(false);
  const [scannerFeedback, setScannerFeedback] = useState<string | null>(null);
  const [expandedBatchPickerMedId, setExpandedBatchPickerMedId] = useState<string | null>(null);

  // Cart & Customer states
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [selectedApiCustomer, setSelectedApiCustomer] = useState<CustomerAccount | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [apiCustomerResults, setApiCustomerResults] = useState<CustomerAccount[]>([]);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [showAdvancedCustomerTax, setShowAdvancedCustomerTax] = useState(false);

  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [doctorRegNumber, setDoctorRegNumber] = useState('');
  const [isInterState, setIsInterState] = useState(false);

  // Payment & Khata states
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('upi');
  const [lastImmediatePaymentMode, setLastImmediatePaymentMode] = useState<PaymentMode>('upi');
  const [splitPayments, setSplitPayments] = useState<Array<{ mode: PaymentMode; amount: number; ref?: string }>>([
    { mode: 'cash', amount: 0 },
    { mode: 'upi', amount: 0 },
  ]);
  const [creditTermsDays, setCreditTermsDays] = useState<0 | 7 | 15 | 30>(15);
  const [overrideCreditLimit, setOverrideCreditLimit] = useState(false);
  const [creditOverrideReason, setCreditOverrideReason] = useState('');
  const [isSubmittingBill, setIsSubmittingBill] = useState(false);

  const [customerDiscount, setCustomerDiscount] = useState<number>(store.defaultDiscountPercent || 10);
  const [billSuccessMessage, setBillSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Return modal state
  const [selectedInvoiceForReturn, setSelectedInvoiceForReturn] = useState<BillInvoice | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, number>>({});
  const [returnReason, setReturnReason] = useState('Customer Return');
  const [restockReturn, setRestockReturn] = useState(true);

  // Cancel modal state
  const [selectedInvoiceForCancel, setSelectedInvoiceForCancel] = useState<BillInvoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Payment collection modal state
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<BillInvoice | null>(null);
  const [collectionAmount, setCollectionAmount] = useState<number>(0);
  const [collectionMode, setCollectionMode] = useState<PaymentMode>('cash');
  const [collectionRef, setCollectionRef] = useState('');

  // History search state
  const [historySearch, setHistorySearch] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcuts for fast counter billing:
  // F2 = focus medicine search, F4 = barcode mode, Ctrl/Cmd+Enter = confirm & print bill
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        setIsScannerMode(false);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      } else if (e.key === 'F4') {
        e.preventDefault();
        setIsScannerMode(prev => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (activeTab === 'terminal') {
          e.preventDefault();
          void handleCompleteBillRef.current?.();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  useEffect(() => {
    if (isScannerMode) {
      barcodeInputRef.current?.focus();
    } else if (activeTab === 'terminal') {
      searchInputRef.current?.focus();
    }
  }, [isScannerMode, activeTab]);

  const isExpired = (expiryDate: string): boolean => isBatchExpired(expiryDate);

  // Grouped FEFO-sorted sellable medicines (strictly excluding expired & zero-stock batches)
  const medicineSearchResults = useMemo<SearchableBillingEntry[]>(() => {
    if (!searchQuery.trim()) return [];
    return searchSellableMedicines(searchQuery, inventory, medicines).slice(0, 12);
  }, [searchQuery, inventory, medicines]);

  // Frequent in-stock medicines when search bar is empty
  const quickPickMedicines = useMemo<SearchableBillingEntry[]>(() => {
    return searchSellableMedicines('', inventory, medicines).slice(0, 6);
  }, [inventory, medicines]);

  // Check if any cart item is Schedule H, H1, or X
  const hasScheduledDrug = cart.some(
    item => item.schedule === 'Schedule H' || item.schedule === 'Schedule H1' || item.schedule === 'Schedule X'
  );

  // Handle barcode scanner input auto-submission
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    const codeLower = code.toLowerCase();
    const matchedBatch = inventory.find(
      b =>
        (b.barcode && b.barcode.toLowerCase() === codeLower) ||
        b.batchNumber.toLowerCase() === codeLower
    );

    if (matchedBatch) {
      if (matchedBatch.currentStock <= 0 || isExpired(matchedBatch.expiryDate)) {
        setScannerFeedback(`Batch '${matchedBatch.batchNumber}' is expired or out of stock and cannot be billed.`);
      } else {
        handleAddToCart(matchedBatch);
        setScannerFeedback(`Added ${matchedBatch.brandName} (Batch ${matchedBatch.batchNumber})`);
      }
    } else {
      const medEntry = searchSellableMedicines(code, inventory, medicines).find(
        m => m.barcode?.toLowerCase() === codeLower || m.medicineId.toLowerCase() === codeLower
      );
      if (medEntry) {
        handleAddToCart(medEntry.fefoBatch);
        setScannerFeedback(`Added ${medEntry.brandName} (${medEntry.fefoBatch.batchNumber})`);
      } else {
        setScannerFeedback(`No active stock found for code: ${code}`);
      }
    }

    setBarcodeInput('');
    setTimeout(() => setScannerFeedback(null), 3000);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim()) {
      e.preventDefault();
      if (medicineSearchResults.length > 0) {
        handleAddToCart(medicineSearchResults[0]!.fefoBatch);
      } else {
        setErrorMessage(`No in-stock non-expired medicine matched "${searchQuery.trim()}".`);
        setTimeout(() => setErrorMessage(null), 2500);
      }
    }
  };

  const handleAddToCart = (batch: (typeof inventory)[0]) => {
    if (batch.currentStock <= 0 || isExpired(batch.expiryDate)) {
      setErrorMessage(`Batch ${batch.batchNumber} cannot be billed because it is expired or out of stock.`);
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    const medMaster = medicines.find(m => m.id === batch.medicineId);
    const schedule: ScheduleCategory = medMaster ? medMaster.schedule : 'Schedule H';
    const gstSlab = medMaster ? medMaster.gstSlab : 12;
    const unitPrice = batch.sellingPrice && batch.sellingPrice > 0 ? batch.sellingPrice : batch.mrp;

    setCart(prev => {
      const existing = prev.find(item => item.batchId === batch.id);
      if (existing) {
        if (existing.quantity >= batch.currentStock) {
          setErrorMessage(`Only ${batch.currentStock} packs available in batch ${batch.batchNumber}.`);
          setTimeout(() => setErrorMessage(null), 3000);
          return prev;
        }
        return prev.map(item =>
          item.batchId === batch.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      const newItem: CartItem = {
        batchId: batch.id,
        medicineId: batch.medicineId,
        brandName: batch.brandName,
        saltComposition: batch.saltComposition,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        packSize: batch.packSize,
        mrp: unitPrice,
        discountPercent: customerDiscount,
        gstSlab,
        quantity: 1,
        availableStock: batch.currentStock,
        schedule,
      };
      return [...prev, newItem];
    });

    setSearchQuery('');
    setExpandedBatchPickerMedId(null);
  };

  const handleUpdateQuantity = (batchId: string, qty: number) => {
    setCart(prev =>
      prev
        .map(item => {
          if (item.batchId === batchId) {
            const validQty = Math.max(1, Math.min(qty, item.availableStock));
            return { ...item, quantity: validQty };
          }
          return item;
        })
        .filter(item => item.quantity > 0)
    );
  };

  const handleUpdateItemDiscount = (batchId: string, disc: number) => {
    setCart(prev =>
      prev.map(item =>
        item.batchId === batchId
          ? { ...item, discountPercent: Math.max(0, Math.min(disc, 50)) }
          : item
      )
    );
  };

  const handleRemoveFromCart = (batchId: string) => {
    setCart(prev => prev.filter(item => item.batchId !== batchId));
  };

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (!isLiveApi || !isCustomerDropdownOpen) return;
    let active = true;
    const timer = setTimeout(async () => {
      setIsSearchingCustomers(true);
      try {
        const res = await customerApi.listCustomers(apiSession, {
          search: customerSearchQuery.trim() || undefined,
          limit: 15,
        });
        if (active) setApiCustomerResults(res.customers);
      } catch {
        if (active) setApiCustomerResults([]);
      } finally {
        if (active) setIsSearchingCustomers(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isLiveApi, isCustomerDropdownOpen, customerSearchQuery, apiSession]);

  const localCustomerResults = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    return customers
      .filter(c => !c.isArchived)
      .filter(c => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.doctorName && c.doctorName.toLowerCase().includes(q))
        );
      })
      .slice(0, 12);
  }, [customers, customerSearchQuery]);

  const activeRegisteredCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    if (isLiveApi && selectedApiCustomer && selectedApiCustomer.id === selectedCustomerId) {
      return {
        id: selectedApiCustomer.id,
        name: selectedApiCustomer.name,
        phone: selectedApiCustomer.phone,
        status: selectedApiCustomer.status,
        isArchived: selectedApiCustomer.isArchived,
        creditEnabled: selectedApiCustomer.creditEnabled,
        creditLimit: selectedApiCustomer.creditLimit ?? 0,
        creditTermsDays: selectedApiCustomer.creditTermsDays ?? 15,
        outstanding: selectedApiCustomer.currentOutstandingBalance ?? 0,
        advance: selectedApiCustomer.advanceBalance ?? 0,
        doctorName: selectedApiCustomer.preferredDoctorName || '',
      };
    }
    const local = customers.find(c => c.id === selectedCustomerId);
    if (!local) return null;
    return {
      id: local.id,
      name: local.name,
      phone: local.phone,
      status: local.status || 'ACTIVE',
      isArchived: Boolean(local.isArchived),
      creditEnabled: local.creditEnabled ?? true,
      creditLimit: local.creditLimit ?? 0,
      creditTermsDays: local.creditTermsDays ?? 15,
      outstanding: local.khataBalance || 0,
      advance: local.advanceBalance || 0,
      doctorName: local.doctorName || '',
    };
  }, [selectedCustomerId, isLiveApi, selectedApiCustomer, customers]);

  const handleSelectLocalCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setSelectedApiCustomer(null);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    if (cust.doctorName) setDoctorName(cust.doctorName);
    setCreditTermsDays(cust.creditTermsDays ?? 15);
    setOverrideCreditLimit(false);
    setCreditOverrideReason('');
    setCustomerSearchQuery('');
    setIsCustomerDropdownOpen(false);
  };

  const handleSelectApiCustomer = (cust: CustomerAccount) => {
    setSelectedCustomerId(cust.id);
    setSelectedApiCustomer(cust);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    if (cust.preferredDoctorName) setDoctorName(cust.preferredDoctorName);
    setCreditTermsDays(cust.creditTermsDays ?? 15);
    setOverrideCreditLimit(false);
    setCreditOverrideReason('');
    setCustomerSearchQuery('');
    setIsCustomerDropdownOpen(false);
  };

  const handleResetWalkIn = () => {
    setSelectedCustomerId('');
    setSelectedApiCustomer(null);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setOverrideCreditLimit(false);
    setCreditOverrideReason('');
  };

  const handleCustomerPhoneChange = (input: string) => {
    setCustomerPhone(input);
    const cleaned = input.trim();
    if (cleaned.length >= 10) {
      const existing = customers.find(c => !c.isArchived && c.phone.replace(/\D/g, '').includes(cleaned.replace(/\D/g, '').slice(-10)));
      if (existing) {
        handleSelectLocalCustomer(existing);
      }
    }
  };

  // Monetary calculations with 2-decimal paise precision
  const roundPaise = (amount: number): number => Math.round((amount + Number.EPSILON) * 100) / 100;

  const subtotal = roundPaise(cart.reduce((acc, curr) => acc + curr.mrp * curr.quantity, 0));
  const totalDiscount = roundPaise(
    cart.reduce((acc, curr) => acc + (curr.mrp * curr.quantity * curr.discountPercent) / 100, 0)
  );
  const netPayable = roundPaise(subtotal - totalDiscount);

  // Indian GST retail calculation (tax inclusive of MRP)
  let taxableAmount = 0;
  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  cart.forEach(item => {
    const lineNet = roundPaise(item.mrp * item.quantity);
    const lineDisc = roundPaise(lineNet * (item.discountPercent / 100));
    const linePay = roundPaise(lineNet - lineDisc);
    const lineTaxable = roundPaise(linePay / (1 + item.gstSlab / 100));
    const lineTax = roundPaise(linePay - lineTaxable);

    taxableAmount = roundPaise(taxableAmount + lineTaxable);
    if (isInterState) {
      igst = roundPaise(igst + lineTax);
    } else {
      const halfTax = roundPaise(lineTax / 2);
      cgst = roundPaise(cgst + halfTax);
      sgst = roundPaise(sgst + (lineTax - halfTax));
    }
  });

  const rawTotal = roundPaise(taxableAmount + cgst + sgst + igst);
  const grandTotal = Math.round(rawTotal);
  const roundOff = roundPaise(grandTotal - rawTotal);

  // Payment breakdown (separates immediate settlement from Khata credit)
  const khataCreditAmount = useMemo(() => {
    if (!isSplitPayment) {
      return paymentMode === 'khata_credit' ? grandTotal : 0;
    }
    return roundPaise(
      splitPayments
        .filter(p => p.mode === 'khata_credit')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    );
  }, [isSplitPayment, paymentMode, splitPayments, grandTotal]);

  const immediatePaidAmount = useMemo(() => {
    if (!isSplitPayment) {
      return paymentMode === 'khata_credit' ? 0 : grandTotal;
    }
    return roundPaise(
      splitPayments
        .filter(p => p.mode !== 'khata_credit')
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
    );
  }, [isSplitPayment, paymentMode, splitPayments, grandTotal]);

  const totalSplitAllocated = roundPaise(immediatePaidAmount + khataCreditAmount);
  const remainingSplitDue = roundPaise(Math.max(0, grandTotal - totalSplitAllocated));
  const usesKhataCredit = khataCreditAmount > 0;

  // Khata credit eligibility & limit projection
  const khataCheck = useMemo(() => {
    if (!usesKhataCredit) {
      return { blocked: false, requiresOverride: false, reason: '', projectedOutstanding: 0, availableCredit: 0 };
    }
    if (!activeRegisteredCustomer) {
      return {
        blocked: true,
        requiresOverride: false,
        reason: 'Select or register a customer account before billing on Khata credit.',
        projectedOutstanding: 0,
        availableCredit: 0,
      };
    }
    if (activeRegisteredCustomer.isArchived || activeRegisteredCustomer.status !== 'ACTIVE') {
      return {
        blocked: true,
        requiresOverride: false,
        reason: `Customer account is ${activeRegisteredCustomer.isArchived ? 'ARCHIVED' : activeRegisteredCustomer.status}. Khata credit billing is disabled.`,
        projectedOutstanding: activeRegisteredCustomer.outstanding,
        availableCredit: 0,
      };
    }
    if (!activeRegisteredCustomer.creditEnabled) {
      return {
        blocked: true,
        requiresOverride: false,
        reason: 'Khata credit facility is disabled for this customer account.',
        projectedOutstanding: activeRegisteredCustomer.outstanding,
        availableCredit: 0,
      };
    }

    const advanceConsumed = Math.min(activeRegisteredCustomer.advance, khataCreditAmount);
    const netNewCredit = roundPaise(Math.max(0, khataCreditAmount - advanceConsumed));
    const projectedOutstanding = roundPaise(activeRegisteredCustomer.outstanding + netNewCredit);
    const limit = activeRegisteredCustomer.creditLimit;
    const availableCredit = roundPaise(Math.max(0, limit - activeRegisteredCustomer.outstanding));

    if (limit > 0 && projectedOutstanding > limit) {
      if (!canOverrideCredit) {
        return {
          blocked: true,
          requiresOverride: false,
          reason: `Projected Khata balance ₹${projectedOutstanding.toFixed(2)} exceeds credit limit ₹${limit.toFixed(2)}. Your role cannot authorize overrides.`,
          projectedOutstanding,
          availableCredit,
        };
      }
      if (!overrideCreditLimit || creditOverrideReason.trim().length < 3) {
        return {
          blocked: true,
          requiresOverride: true,
          reason: `Projected balance ₹${projectedOutstanding.toFixed(2)} exceeds limit ₹${limit.toFixed(2)}. Enable Credit Limit Override and provide a reason.`,
          projectedOutstanding,
          availableCredit,
        };
      }
    }

    return {
      blocked: false,
      requiresOverride: limit > 0 && projectedOutstanding > limit,
      reason: '',
      projectedOutstanding,
      availableCredit,
    };
  }, [usesKhataCredit, activeRegisteredCustomer, khataCreditAmount, canOverrideCredit, overrideCreditLimit, creditOverrideReason]);

  const isSplitMismatch = isSplitPayment && Math.abs(totalSplitAllocated - grandTotal) > 0.01;

  const handleCompleteBill = async () => {
    if (cart.length === 0 || isSubmittingBill) return;

    if (hasScheduledDrug && !doctorName.trim()) {
      setErrorMessage('Prescription Alert: Schedule H / H1 / X drugs require prescribing Doctor Name for statutory Form 20B/21B compliance.');
      setTimeout(() => setErrorMessage(null), 5000);
      return;
    }

    if (isSplitMismatch) {
      setErrorMessage(`Split payment allocation (₹${totalSplitAllocated.toFixed(2)}) must equal Payable Amount (₹${grandTotal.toFixed(2)}).`);
      return;
    }

    if (khataCheck.blocked) {
      setErrorMessage(khataCheck.reason);
      return;
    }

    let finalPayments: PaymentRecord[] = [];
    let effectivePaymentMode: PaymentMode = paymentMode;

    if (isSplitPayment) {
      finalPayments = splitPayments
        .filter(p => Number(p.amount) > 0)
        .map(p => ({
          id: `pay-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
          mode: p.mode,
          amount: roundPaise(Number(p.amount)),
          referenceNumber: p.ref,
          timestamp: new Date().toISOString(),
        }));
      effectivePaymentMode = finalPayments.some(p => p.mode === 'khata_credit')
        ? 'khata_credit'
        : finalPayments[0]?.mode || 'cash';
    } else {
      finalPayments = [
        {
          id: `pay-${Date.now().toString(36)}`,
          mode: paymentMode,
          amount: grandTotal,
          timestamp: new Date().toISOString(),
        },
      ];
    }

    if (isLiveApi) {
      setIsSubmittingBill(true);
      setErrorMessage(null);
      try {
        const res = await customerApi.checkoutPOS(
          apiSession,
          {
            customerId: activeRegisteredCustomer?.id,
            customer: {
              name: customerName.trim() || 'Walk-in Customer',
              phone: customerPhone.trim() || undefined,
              doctorName: doctorName.trim() || undefined,
              doctorRegNumber: doctorRegNumber.trim() || undefined,
            },
            items: cart.map(c => ({
              medicineId: c.medicineId,
              batchId: c.batchId,
              quantity: c.quantity,
              mrp: c.mrp,
              discountPercent: c.discountPercent,
              gstRate: c.gstSlab,
            })),
            payments: finalPayments.map(p => ({
              mode: p.mode,
              amount: p.amount,
              referenceNumber: p.referenceNumber,
            })),
            paymentMode: effectivePaymentMode,
            creditTermsDays: usesKhataCredit ? creditTermsDays : undefined,
            overrideCreditLimit: overrideCreditLimit || undefined,
            creditOverrideReason: overrideCreditLimit ? creditOverrideReason.trim() : undefined,
            isInterState,
          },
          generateIdempotencyKey('pos')
        );

        const inv = res.invoice;
        const mappedBill: BillInvoice = {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          timestamp: inv.createdAt,
          branchId: inv.branchId,
          customerId: inv.customerId,
          customerName: inv.customer?.name || customerName,
          customerPhone: inv.customer?.phone || customerPhone,
          doctorName: inv.customer?.doctorName || doctorName,
          doctorRegNumber: inv.customer?.doctorRegNumber || doctorRegNumber,
          items: cart,
          subtotal: inv.subtotal,
          totalDiscount: inv.totalDiscount,
          taxableAmount: inv.taxableAmount,
          cgst: inv.cgst,
          sgst: inv.sgst,
          igst: inv.igst,
          roundOff: inv.roundOff,
          grandTotal: inv.grandTotal,
          amountPaid: inv.amountPaid,
          khataCreditAmount: inv.khataCreditAmount,
          balanceDue: inv.balanceDue,
          creditTermsDays: inv.creditTermsDays,
          dueDate: inv.dueDate,
          paymentStatus: inv.paymentStatus,
          payments: finalPayments,
          paymentMode: effectivePaymentMode,
          status: inv.balanceDue > 0 ? 'credit' : 'completed',
          cashierName: currentUser.name,
        };
        setBillSuccessMessage(`Cloud Firestore Invoice ${mappedBill.invoiceNumber} committed (₹${mappedBill.grandTotal.toFixed(2)})`);
        setPrintInvoiceData(mappedBill);
      } catch (err) {
        const msg = err instanceof ApiClientError ? err.detail : 'Failed to complete POS checkout';
        setErrorMessage(msg);
        setIsSubmittingBill(false);
        return;
      } finally {
        setIsSubmittingBill(false);
      }
    } else {
      const created = createBill({
        customerId: activeRegisteredCustomer?.id,
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim(),
        doctorName: doctorName.trim(),
        doctorRegNumber: doctorRegNumber.trim(),
        items: cart,
        subtotal,
        totalDiscount,
        taxableAmount,
        cgst,
        sgst,
        igst,
        roundOff,
        grandTotal,
        amountPaid: immediatePaidAmount,
        khataCreditAmount,
        balanceDue: khataCreditAmount,
        creditTermsDays: usesKhataCredit ? creditTermsDays : undefined,
        paymentStatus: khataCreditAmount === 0 ? 'paid' : immediatePaidAmount > 0 ? 'partial' : 'unpaid',
        payments: finalPayments,
        paymentMode: effectivePaymentMode,
        status: khataCreditAmount > 0 ? 'credit' : 'completed',
      });

      setBillSuccessMessage(`Bill ${created.invoiceNumber} created successfully (₹${created.grandTotal.toFixed(2)})`);
      setPrintInvoiceData(created);
    }

    // Reset terminal and keep non-sensitive last immediate payment mode ready
    setCart([]);
    handleResetWalkIn();
    setDoctorName('');
    setDoctorRegNumber('');
    setIsSplitPayment(false);
    setPaymentMode(lastImmediatePaymentMode);
    setSplitPayments([
      { mode: 'cash', amount: 0 },
      { mode: 'upi', amount: 0 },
    ]);
    setTimeout(() => {
      setBillSuccessMessage(null);
    }, 4500);
  };

  const handleCompleteBillRef = useRef<(() => Promise<void>) | null>(null);
  handleCompleteBillRef.current = handleCompleteBill;

  // Returns logic
  const handleOpenReturnModal = (invoice: BillInvoice) => {
    setSelectedInvoiceForReturn(invoice);
    const initialQtys: Record<string, number> = {};
    invoice.items.forEach(item => {
      initialQtys[item.batchId] = 0;
    });
    setReturnQuantities(initialQtys);
    setReturnReason('Patient Medicine Return');
  };

  const handleConfirmReturn = () => {
    if (!selectedInvoiceForReturn) return;

    const returnItems = Object.entries(returnQuantities)
      .filter(([_, qty]) => qty > 0)
      .map(([batchId, quantity]) => ({
        batchId,
        quantity,
        reason: returnReason,
        restock: restockReturn,
      }));

    if (returnItems.length === 0) {
      alert('Please specify return quantity for at least one item');
      return;
    }

    processSalesReturn(selectedInvoiceForReturn.id, returnItems, returnReason);
    setSelectedInvoiceForReturn(null);
    setBillSuccessMessage(`Sales return processed for ${selectedInvoiceForReturn.invoiceNumber}`);
    setTimeout(() => setBillSuccessMessage(null), 3000);
  };

  // Cancellation logic
  const handleConfirmCancel = () => {
    if (!selectedInvoiceForCancel) return;
    if (!cancelReason.trim()) {
      alert('Please enter a cancellation reason');
      return;
    }

    cancelBill(selectedInvoiceForCancel.id, cancelReason);
    setSelectedInvoiceForCancel(null);
    setCancelReason('');
    setBillSuccessMessage(`Invoice ${selectedInvoiceForCancel.invoiceNumber} has been cancelled`);
    setTimeout(() => setBillSuccessMessage(null), 3000);
  };

  // Collection modal logic
  const handleOpenCollectionModal = (invoice: BillInvoice) => {
    setSelectedInvoiceForPayment(invoice);
    setCollectionAmount(invoice.balanceDue);
    setCollectionMode('cash');
    setCollectionRef('');
  };

  const handleConfirmCollection = () => {
    if (!selectedInvoiceForPayment || collectionAmount <= 0) return;
    recordBillPayment(selectedInvoiceForPayment.id, {
      mode: collectionMode,
      amount: collectionAmount,
      referenceNumber: collectionRef || undefined,
    });
    setSelectedInvoiceForPayment(null);
    setBillSuccessMessage(`Payment of ₹${collectionAmount} recorded for ${selectedInvoiceForPayment.invoiceNumber}`);
    setTimeout(() => setBillSuccessMessage(null), 3000);
  };

  const filteredBills = useMemo(() => {
    if (!historySearch.trim()) return bills;
    const q = historySearch.toLowerCase();
    return bills.filter(
      b =>
        b.invoiceNumber.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.customerPhone.includes(q)
    );
  }, [historySearch, bills]);

  return (
    <div className="space-y-4">
      {/* Top Bar & Plain-Language Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Counter Billing</h1>
          <p className="text-xs text-slate-500">
            {store.name} · Cashier: <span className="font-medium text-slate-700">{currentUser.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('terminal')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'terminal' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            New Bill
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`flex-1 sm:flex-initial px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'history' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bill History ({bills.length})
          </button>
        </div>
      </div>

      {billSuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{billSuccessMessage}</span>
          </div>
          <span className="text-emerald-700 text-[11px]">Saved</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-red-700 text-xs font-bold shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: FAST COUNTER BILLING */}
      {/* ========================================================================= */}
      {activeTab === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column: Medicine Search/Scan + Cart + Compact Customer Bar (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* 1. Unified Medicine Search & Barcode Input (Front & Center) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsScannerMode(false)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      !isScannerMode ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Search Medicine (F2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScannerMode(true)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap ${
                      isScannerMode ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Barcode className="w-3.5 h-3.5" />
                    <span>Scan Barcode (F4)</span>
                  </button>
                </div>

                <span className="text-[11px] text-slate-500">Earliest expiry picked first</span>
              </div>

              {isScannerMode ? (
                <form onSubmit={handleBarcodeSubmit} className="space-y-2">
                  <div className="relative">
                    <Barcode className="w-5 h-5 text-purple-600 absolute left-3 top-2.5" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      placeholder="Scan medicine barcode or batch number and press Enter..."
                      value={barcodeInput}
                      onChange={e => setBarcodeInput(e.target.value)}
                      className="w-full pl-10 pr-24 py-2.5 text-sm font-mono border-2 border-purple-400 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 bg-purple-50/20"
                    />
                    <button
                      type="submit"
                      className="absolute right-2 top-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-semibold hover:bg-purple-700"
                    >
                      Add
                    </button>
                  </div>
                  {scannerFeedback && (
                    <div className="text-xs font-medium text-purple-700 px-1">{scannerFeedback}</div>
                  )}
                </form>
              ) : (
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Type medicine name, salt, strength, barcode, or batch — press Enter to add..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full pl-9 pr-8 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-slate-700"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}

              {/* Instant Search Results (Grouped by Medicine, Auto-FEFO Batch) */}
              {searchQuery.trim() && !isScannerMode && (
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                  {medicineSearchResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">
                      No in-stock non-expired medicine matches &ldquo;{searchQuery.trim()}&rdquo;.
                    </div>
                  ) : (
                    medicineSearchResults.map((entry, idx) => {
                      const fefo = entry.fefoBatch;
                      const unitPrice = fefo.sellingPrice && fefo.sellingPrice > 0 ? fefo.sellingPrice : fefo.mrp;
                      const hasMultipleBatches = entry.eligibleBatches.length > 1;
                      const isExpanded = expandedBatchPickerMedId === entry.medicineId;

                      return (
                        <div key={entry.medicineId} className="bg-white">
                          <div className="p-3 hover:bg-slate-50 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900">
                                  {entry.brandName}
                                </span>
                                {entry.strength && (
                                  <span className="text-[11px] font-medium text-slate-600">
                                    {entry.strength}
                                  </span>
                                )}
                                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                                  Earliest Expiry {idx === 0 ? '· Press Enter' : ''}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {entry.saltComposition} · {entry.packSize} · Rack {entry.rackLocation}
                              </div>
                              <div className="text-[11px] text-slate-600 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                                <span>Batch {fefo.batchNumber}</span>
                                <span>·</span>
                                <span>Exp {fefo.expiryDate}</span>
                                <span>·</span>
                                <span className="font-semibold text-slate-800">
                                  {entry.totalAvailableStock} in stock
                                </span>
                                {hasMultipleBatches && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setExpandedBatchPickerMedId(isExpanded ? null : entry.medicineId)
                                    }
                                    className="font-sans text-blue-700 hover:underline font-semibold"
                                  >
                                    {isExpanded ? 'Hide batches' : `Pick from ${entry.eligibleBatches.length} batches`}
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="text-right">
                                <span className="text-xs font-mono tabular-nums font-bold text-slate-900 block">
                                  ₹{unitPrice.toFixed(2)}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {fefo.currentStock} in batch
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddToCart(fefo)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add</span>
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-3 pb-2.5 pt-1 bg-slate-50 border-t border-slate-100 space-y-1.5">
                              {entry.eligibleBatches.map(b => (
                                <div
                                  key={b.id}
                                  className="flex items-center justify-between text-[11px] bg-white px-2.5 py-1.5 rounded-lg border border-slate-200"
                                >
                                  <div className="font-mono text-slate-700">
                                    Batch {b.batchNumber} · Exp {b.expiryDate} · {b.currentStock} left · ₹
                                    {(b.sellingPrice && b.sellingPrice > 0 ? b.sellingPrice : b.mrp).toFixed(2)}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleAddToCart(b)}
                                    className="px-2 py-0.5 bg-slate-900 text-white rounded font-semibold"
                                  >
                                    Use Batch
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Frequent Medicines Quick Tap Strip */}
              {!searchQuery.trim() && !isScannerMode && quickPickMedicines.length > 0 && (
                <div>
                  <span className="text-[11px] font-medium text-slate-500 block mb-1.5">
                    Quick Add:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {quickPickMedicines.map(entry => {
                      const b = entry.fefoBatch;
                      return (
                        <button
                          key={entry.medicineId}
                          type="button"
                          onClick={() => handleAddToCart(b)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg text-[11px] font-medium text-slate-800 transition-colors"
                        >
                          + {entry.brandName.split(' ').slice(0, 2).join(' ')} (₹{b.mrp.toFixed(0)})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Cart Items */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Bill Items ({cart.length})
                </span>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-xs text-red-600 hover:underline inline-flex items-center gap-1 font-medium"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-medium text-slate-600">No items added yet</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Search above or scan a barcode to start billing.
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile Stacked Cart Cards (< sm) */}
                  <div className="sm:hidden divide-y divide-slate-100">
                    {cart.map(item => {
                      const lineGross = roundPaise(item.mrp * item.quantity);
                      const lineDisc = roundPaise(lineGross * (item.discountPercent / 100));
                      const lineTotal = roundPaise(lineGross - lineDisc);
                      return (
                        <div key={item.batchId} className="p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 truncate">
                                {item.brandName}
                              </div>
                              <div className="text-[11px] font-mono text-slate-500">
                                Batch {item.batchNumber} · Exp {item.expiryDate}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(item.batchId)}
                              className="p-1 text-slate-400 hover:text-red-600"
                              aria-label={`Remove ${item.brandName}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="inline-flex items-center border border-slate-200 rounded-lg">
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(item.batchId, item.quantity - 1)}
                                className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 font-bold"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={item.availableStock}
                                value={item.quantity}
                                onChange={e => handleUpdateQuantity(item.batchId, Number(e.target.value) || 1)}
                                className="w-10 text-center font-mono text-xs font-bold text-slate-900 py-1"
                              />
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(item.batchId, item.quantity + 1)}
                                className="px-2.5 py-1 text-slate-700 hover:bg-slate-100 font-bold"
                              >
                                +
                              </button>
                            </div>

                            <div className="text-right font-mono tabular-nums">
                              <span className="text-xs font-bold text-slate-900 block">
                                ₹{lineTotal.toFixed(2)}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                ₹{item.mrp.toFixed(2)} × {item.quantity}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Tablet & Desktop Cart Table (>= sm) */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/40 text-slate-600 font-semibold text-[11px]">
                          <th className="py-2 px-3">Medicine</th>
                          <th className="py-2 px-2 font-mono">Batch & Exp</th>
                          <th className="py-2 px-2 text-center">Qty</th>
                          <th className="py-2 px-2 text-right font-mono">Price</th>
                          <th className="py-2 px-2 text-center font-mono">Disc %</th>
                          <th className="py-2 px-3 text-right font-mono">Total</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cart.map(item => {
                          const lineGross = roundPaise(item.mrp * item.quantity);
                          const lineDisc = roundPaise(lineGross * (item.discountPercent / 100));
                          const lineTotal = roundPaise(lineGross - lineDisc);
                          return (
                            <tr key={item.batchId} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3">
                                <span className="font-bold text-slate-900 block truncate max-w-[170px]">
                                  {item.brandName}
                                </span>
                                <span className="text-[10px] text-slate-500 block truncate max-w-[170px]">
                                  {item.saltComposition}
                                </span>
                                {item.schedule.startsWith('Schedule') && (
                                  <span className="text-[10px] font-semibold text-red-600">
                                    {item.schedule} (Rx)
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2 font-mono text-[11px] text-slate-600">
                                <div>{item.batchNumber}</div>
                                <div className="text-slate-400">{item.expiryDate}</div>
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <div className="inline-flex items-center border border-slate-200 rounded-md">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateQuantity(item.batchId, item.quantity - 1)}
                                    className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={item.availableStock}
                                    value={item.quantity}
                                    onChange={e => handleUpdateQuantity(item.batchId, Number(e.target.value) || 1)}
                                    className="w-10 text-center font-mono font-bold text-slate-800 py-0.5"
                                    aria-label={`Quantity for ${item.brandName}`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateQuantity(item.batchId, item.quantity + 1)}
                                    className="px-2 py-0.5 text-slate-600 hover:bg-slate-100 font-bold"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                                ₹{item.mrp.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-2 text-center font-mono">
                                <input
                                  type="number"
                                  min="0"
                                  max="50"
                                  value={item.discountPercent}
                                  onChange={e => handleUpdateItemDiscount(item.batchId, Number(e.target.value))}
                                  className="w-12 text-center text-xs py-0.5 border border-slate-200 rounded font-mono"
                                  aria-label={`Discount percent for ${item.brandName}`}
                                />
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 tabular-nums">
                                ₹{lineTotal.toFixed(2)}
                              </td>
                              <td className="py-2.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFromCart(item.batchId)}
                                  className="p-1 text-slate-400 hover:text-red-600"
                                  aria-label={`Remove ${item.brandName}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {/* 3. Compact Customer & Prescription Bar (Stays out of the way for walk-in sales) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  Customer: {activeRegisteredCustomer ? activeRegisteredCustomer.name : 'Walk-in Customer'}
                </span>

                <div className="flex items-center gap-2">
                  {hasScheduledDrug && (
                    <span className="text-[11px] font-semibold text-red-700 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                      Doctor Name Needed (Rx)
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAdvancedCustomerTax(prev => !prev)}
                    className="text-xs font-semibold text-blue-700 hover:underline"
                  >
                    {showAdvancedCustomerTax ? 'Hide Details' : 'Prescription & Tax Details'}
                  </button>
                </div>
              </div>

              {/* Customer Lookup + Quick Register */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2" ref={customerDropdownRef}>
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Find customer by name or mobile (optional for walk-in)..."
                    value={customerSearchQuery}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    onChange={e => {
                      setCustomerSearchQuery(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />

                  {isCustomerDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {isLiveApi ? (
                        isSearchingCustomers ? (
                          <div className="p-3 text-xs text-slate-500">Searching customers...</div>
                        ) : apiCustomerResults.length === 0 ? (
                          <div className="p-3 text-xs text-slate-500">No matching customers found.</div>
                        ) : (
                          apiCustomerResults.map(cust => (
                            <button
                              key={cust.id}
                              type="button"
                              onClick={() => handleSelectApiCustomer(cust)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <div className="font-semibold text-slate-900">{cust.name}</div>
                                <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                                  {canViewPhone ? cust.phone : maskPhone(cust.phone)}
                                  {cust.preferredDoctorName ? ` · ${cust.preferredDoctorName}` : ''}
                                </div>
                              </div>
                              <div className="text-right font-mono tabular-nums shrink-0">
                                <div className={`text-[11px] font-semibold ${(cust.currentOutstandingBalance || 0) > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                  Due: ₹{(cust.currentOutstandingBalance || 0).toFixed(0)}
                                </div>
                              </div>
                            </button>
                          ))
                        )
                      ) : localCustomerResults.length === 0 ? (
                        <div className="p-3 text-xs text-slate-500">No matching customers found.</div>
                      ) : (
                        localCustomerResults.map(cust => (
                          <button
                            key={cust.id}
                            type="button"
                            onClick={() => handleSelectLocalCustomer(cust)}
                            className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <div className="font-semibold text-slate-900">{cust.name}</div>
                              <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                                {canViewPhone ? cust.phone : maskPhone(cust.phone)}
                                {cust.doctorName ? ` · ${cust.doctorName}` : ''}
                              </div>
                            </div>
                            <div className="text-right font-mono tabular-nums shrink-0">
                              <div className={`text-[11px] font-semibold ${cust.khataBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                                Due: ₹{cust.khataBalance.toFixed(0)}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {selectedCustomerId && (
                    <button
                      type="button"
                      onClick={handleResetWalkIn}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
                    >
                      Walk-in
                    </button>
                  )}
                  {hasUserPermission('customers.create') && (
                    <button
                      type="button"
                      onClick={() => setActiveQuickModal('customer')}
                      className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50/70 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>New Customer</span>
                    </button>
                  )}
                </div>
              </div>

              {activeRegisteredCustomer && (
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-slate-900">
                    {activeRegisteredCustomer.name} ·{' '}
                    <span className="font-mono">
                      {canViewPhone ? activeRegisteredCustomer.phone : maskPhone(activeRegisteredCustomer.phone)}
                    </span>
                  </span>
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span>
                      Pending:{' '}
                      <strong className={activeRegisteredCustomer.outstanding > 0 ? 'text-amber-700' : 'text-slate-900'}>
                        ₹{activeRegisteredCustomer.outstanding.toFixed(2)}
                      </strong>
                    </span>
                    <span>
                      Limit: <strong>₹{activeRegisteredCustomer.creditLimit.toFixed(0)}</strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Doctor Name appears inline automatically whenever Rx drug is in cart */}
              {(hasScheduledDrug || showAdvancedCustomerTax) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-slate-100">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Prescribing Doctor {hasScheduledDrug && <span className="text-red-600">*</span>}
                    </label>
                    <div className="relative">
                      <Stethoscope className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                      <input
                        type="text"
                        placeholder="Dr. Name"
                        value={doctorName}
                        onChange={e => setDoctorName(e.target.value)}
                        className={`w-full pl-8 pr-2 py-1.5 text-xs border rounded-lg focus:outline-hidden ${
                          hasScheduledDrug && !doctorName
                            ? 'border-red-300 bg-red-50/40'
                            : 'border-slate-300 focus:border-blue-600'
                        }`}
                      />
                    </div>
                  </div>

                  {showAdvancedCustomerTax && (
                    <>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Customer Mobile
                        </label>
                        <input
                          type="tel"
                          placeholder="98200 12345"
                          value={!canViewPhone && activeRegisteredCustomer ? maskPhone(customerPhone) : customerPhone}
                          readOnly={!canViewPhone && Boolean(activeRegisteredCustomer)}
                          onChange={e => handleCustomerPhoneChange(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Doctor Registration No.
                        </label>
                        <input
                          type="text"
                          placeholder="Optional"
                          value={doctorRegNumber}
                          onChange={e => setDoctorRegNumber(e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                        />
                      </div>

                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isInterState}
                            onChange={e => setIsInterState(e.target.checked)}
                            className="rounded text-blue-600"
                          />
                          <span>Inter-State GST (IGST)</span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Sticky Payment & Confirm Bill (5 Cols) */}
          <div className="lg:col-span-5 lg:sticky lg:top-20 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Payment & Bill Total
                </h2>
                <label className="flex items-center gap-1.5 text-xs text-blue-700 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isSplitPayment}
                    onChange={e => setIsSplitPayment(e.target.checked)}
                    className="rounded text-blue-600"
                  />
                  <span>Split Payment</span>
                </label>
              </div>

              {!isSplitPayment ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('upi');
                      setLastImmediatePaymentMode('upi');
                    }}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-colors ${
                      paymentMode === 'upi'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <QrCode className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>UPI / QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('cash');
                      setLastImmediatePaymentMode('cash');
                    }}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-colors ${
                      paymentMode === 'cash'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Wallet className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMode('card');
                      setLastImmediatePaymentMode('card');
                    }}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-colors ${
                      paymentMode === 'card'
                        ? 'border-blue-600 bg-blue-50/70 text-blue-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Card</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMode('khata_credit')}
                    className={`p-2.5 rounded-xl border flex items-center gap-2 font-medium transition-colors ${
                      paymentMode === 'khata_credit'
                        ? 'border-amber-600 bg-amber-50 text-amber-800 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <IndianRupee className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Customer Credit</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">Split Payment</span>
                    <span className="font-mono tabular-nums text-slate-600">Total: ₹{grandTotal.toFixed(2)}</span>
                  </div>

                  <div className="space-y-2">
                    {splitPayments.map((split, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <select
                          value={split.mode}
                          onChange={e => {
                            const nextMode = e.target.value as PaymentMode;
                            setSplitPayments(prev =>
                              prev.map((row, i) => (i === idx ? { ...row, mode: nextMode } : row))
                            );
                          }}
                          className="w-32 px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-medium"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI / QR</option>
                          <option value="card">Card</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="khata_credit">Customer Credit</option>
                        </select>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={split.amount || ''}
                          onChange={e => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setSplitPayments(prev => {
                              const next = prev.map((row, i) => (i === idx ? { ...row, amount: val } : row));
                              if (next.length === 2 && idx === 0) {
                                next[1] = { ...next[1]!, amount: roundPaise(Math.max(0, grandTotal - val)) };
                              }
                              return next;
                            });
                          }}
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono tabular-nums border border-slate-300 rounded-lg bg-white"
                          placeholder="0.00"
                        />
                        {splitPayments.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setSplitPayments(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                    <span className="font-mono tabular-nums text-slate-600">
                      Paid: ₹{immediatePaidAmount.toFixed(2)} · Credit: ₹{khataCreditAmount.toFixed(2)}
                    </span>
                    <span className={`font-mono tabular-nums font-bold ${isSplitMismatch ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {remainingSplitDue > 0 ? `Short: ₹${remainingSplitDue.toFixed(2)}` : isSplitMismatch ? 'Exceeds Total' : 'Matched'}
                    </span>
                  </div>
                </div>
              )}

              {usesKhataCredit && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">Due In</span>
                    <select
                      value={creditTermsDays}
                      onChange={e => setCreditTermsDays(Number(e.target.value) as 0 | 7 | 15 | 30)}
                      className="px-2.5 py-1 text-xs font-mono border border-slate-300 rounded-lg bg-white"
                    >
                      <option value={0}>Today</option>
                      <option value={7}>7 Days</option>
                      <option value={15}>15 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>

                  {activeRegisteredCustomer && (
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-600">
                      <span>New Customer Balance:</span>
                      <span className="font-bold text-slate-900">
                        ₹{khataCheck.projectedOutstanding.toFixed(2)}
                      </span>
                    </div>
                  )}

                  {khataCheck.reason && (
                    <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800 flex items-start gap-2">
                      <Ban className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                      <span>{khataCheck.reason}</span>
                    </div>
                  )}

                  {canOverrideCredit &&
                    activeRegisteredCustomer &&
                    activeRegisteredCustomer.creditLimit > 0 &&
                    khataCheck.projectedOutstanding > activeRegisteredCustomer.creditLimit && (
                      <div className="pt-1 border-t border-slate-200 space-y-2">
                        <label className="flex items-center gap-2 text-[11px] font-semibold text-amber-800 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={overrideCreditLimit}
                            onChange={e => setOverrideCreditLimit(e.target.checked)}
                            className="rounded text-amber-600"
                          />
                          <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                          <span>Approve Credit Override</span>
                        </label>
                        {overrideCreditLimit && (
                          <input
                            type="text"
                            placeholder="Reason for credit override..."
                            value={creditOverrideReason}
                            onChange={e => setCreditOverrideReason(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg bg-white focus:outline-hidden focus:border-amber-600"
                          />
                        )}
                      </div>
                    )}
                </div>
              )}

              {/* Bill Summary Breakdown */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
                  <span className="font-mono tabular-nums">₹{subtotal.toFixed(2)}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-medium">
                    <span>Discount</span>
                    <span className="font-mono tabular-nums">-₹{totalDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>GST Included</span>
                  <span className="font-mono tabular-nums">
                    ₹{(isInterState ? igst : cgst + sgst).toFixed(2)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between pt-3 border-t border-slate-900 text-slate-900 font-bold">
                  <span className="text-sm">Total Payable</span>
                  <span className="text-2xl font-mono tabular-nums text-blue-700">
                    ₹{grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCompleteBill}
                disabled={cart.length === 0 || isSubmittingBill || khataCheck.blocked || isSplitMismatch}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors focus:ring-4 focus:ring-blue-500/20"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {isSubmittingBill
                    ? 'Saving Bill...'
                    : 'Confirm & Print Bill (Ctrl+Enter)'}
                </span>
              </button>
            </div>
          </div>

          {/* Mobile Sticky Quick Confirm Bar (< lg when cart has items) */}
          {cart.length > 0 && (
            <div className="lg:hidden fixed bottom-14 left-3 right-3 z-20 bg-slate-900 text-white rounded-xl px-4 py-2.5 shadow-lg flex items-center justify-between gap-3">
              <div className="font-mono tabular-nums">
                <span className="text-[10px] text-slate-300 block">{cart.length} item(s)</span>
                <span className="text-base font-bold">₹{grandTotal.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={handleCompleteBill}
                disabled={isSubmittingBill || khataCheck.blocked || isSplitMismatch}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>{isSubmittingBill ? 'Saving...' : 'Confirm & Print'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: RECENT INVOICES & RETURNS VIEW */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Sales Invoice History & Returns</h2>
              <p className="text-[11px] text-slate-500">Reprint receipts, record payment collections, and issue sales returns</p>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search invoice no, customer name or phone..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold text-[11px]">
                  <th className="py-2.5 px-3">Invoice Number</th>
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3 text-right font-mono">Grand Total</th>
                  <th className="py-2.5 px-3 text-right font-mono">Balance Due</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                      No matching sales invoices found.
                    </td>
                  </tr>
                ) : (
                  filteredBills.map(bill => {
                    const isCancelled = bill.status === 'cancelled';
                    const isReturned = bill.status === 'returned';
                    const hasDue = bill.balanceDue > 0 && !isCancelled;

                    return (
                      <tr key={bill.id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {bill.invoiceNumber}
                        </td>
                        <td className="py-3 px-3 text-slate-500 text-[11px]">
                          {bill.timestamp}
                        </td>
                        <td className="py-3 px-3">
                          <span className="font-semibold text-slate-800 block">{bill.customerName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{bill.customerPhone || 'Walk-in'}</span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                          ₹{bill.grandTotal.toFixed(2)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono">
                          {hasDue ? (
                            <span className="text-amber-600 font-bold">₹{bill.balanceDue.toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-400">₹0.00</span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          {isCancelled ? (
                            <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                              Cancelled
                            </span>
                          ) : isReturned ? (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                              Returned
                            </span>
                          ) : bill.status === 'partially_returned' ? (
                            <span className="text-[10px] font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                              Partial Return
                            </span>
                          ) : hasDue ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                              Due
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                              Settled
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Print Receipt */}
                            <button
                              onClick={() => setPrintInvoiceData(bill)}
                              title="Reprint Invoice"
                              className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 rounded-lg"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            {/* Collect Balance Due */}
                            {hasDue && (
                              <button
                                onClick={() => handleOpenCollectionModal(bill)}
                                title="Collect Due Payment"
                                className="px-2 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                              >
                                <DollarSign className="w-3 h-3" />
                                <span>Collect</span>
                              </button>
                            )}

                            {/* Sales Return */}
                            {!isCancelled && !isReturned && hasUserPermission('billing.return') && (
                              <button
                                onClick={() => handleOpenReturnModal(bill)}
                                title="Process Return"
                                className="px-2 py-1 bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200 rounded-lg text-[11px] font-semibold flex items-center gap-1"
                              >
                                <Undo2 className="w-3 h-3" />
                                <span>Return</span>
                              </button>
                            )}

                            {/* Cancel Invoice */}
                            {!isCancelled && !isReturned && hasUserPermission('billing.cancel') && (
                              <button
                                onClick={() => setSelectedInvoiceForCancel(bill)}
                                title="Cancel Invoice"
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: SALES RETURN PROCESSING */}
      {/* ========================================================================= */}
      {selectedInvoiceForReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Undo2 className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Sales Return • {selectedInvoiceForReturn.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForReturn(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                Specify quantities of items returned by customer. Non-damaged items will be restored to active inventory.
              </p>

              <div className="space-y-2 border border-slate-200 rounded-xl divide-y divide-slate-100 p-2">
                {selectedInvoiceForReturn.items.map(item => (
                  <div key={item.batchId} className="flex items-center justify-between py-2 px-1">
                    <div>
                      <span className="font-bold text-slate-800 block">{item.brandName}</span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Lot: {item.batchNumber} • Sold: {item.quantity} packs
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-slate-500">Return Qty:</label>
                      <input
                        type="number"
                        min="0"
                        max={item.quantity}
                        value={returnQuantities[item.batchId] || 0}
                        onChange={e => {
                          const val = Math.min(item.quantity, Math.max(0, Number(e.target.value) || 0));
                          setReturnQuantities(prev => ({ ...prev, [item.batchId]: val }));
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 rounded-lg text-center"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reason for Return *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Doctor changed dosage / Wrong product taken"
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={restockReturn}
                  onChange={e => setRestockReturn(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>Restock returned units back to shelf inventory (Non-expired & intact)</span>
              </label>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForReturn(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReturn}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Confirm Sales Return
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: INVOICE CANCELLATION */}
      {/* ========================================================================= */}
      {selectedInvoiceForCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-red-50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold text-red-900">
                  Cancel Invoice • {selectedInvoiceForCancel.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForCancel(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-600">
                Cancelling this invoice will permanently mark it as cancelled, reverse all stock deductions back to the inventory batches, and commit an immutable audit record.
              </p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cancellation Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Billed under incorrect customer / Entry mistake"
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-red-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForCancel(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Void & Cancel Invoice
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: COLLECT BALANCE DUE PAYMENT */}
      {/* ========================================================================= */}
      {selectedInvoiceForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-amber-900">
                  Collect Due • {selectedInvoiceForPayment.invoiceNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedInvoiceForPayment(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono">
                <span className="text-slate-500">Remaining Balance:</span>
                <span className="font-bold text-base text-amber-700">₹{selectedInvoiceForPayment.balanceDue.toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Collection Amount (₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedInvoiceForPayment.balanceDue}
                  value={collectionAmount}
                  onChange={e => setCollectionAmount(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-amber-600 font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Payment Mode *
                </label>
                <select
                  value={collectionMode}
                  onChange={e => setCollectionMode(e.target.value as PaymentMode)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / QR</option>
                  <option value="card">Card / POS</option>
                  <option value="bank_transfer">Bank Transfer (NEFT/IMPS)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Reference / Transaction No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. UPI-987123"
                  value={collectionRef}
                  onChange={e => setCollectionRef(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedInvoiceForPayment(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCollection}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs"
                >
                  Record Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
