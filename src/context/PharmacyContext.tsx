/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  PharmacyStore,
  UserProfile,
  UserRole,
  MedicineMaster,
  InventoryBatch,
  BillInvoice,
  PaymentMode,
  PaymentRecord,
  SalesReturn,
  Customer,
  Supplier,
  NotificationItem,
  NavigationModule,
  EmployeeInvitation,
  StockMovement,
  StockMovementType,
  PurchaseOrder,
  GoodsReceiptNote,
  SupplierInvoice,
  SupplierPayment,
  SupplierReturn,
  SupplierStatus,
  SupplierPaymentMode,
  PharmacyBranch,
  BranchLifecycleStatus,
  BranchClosureCheck,
  BranchAuditLogEntry,
  StockTransfer,
} from '../types/pharmacy.ts';
import {
  INITIAL_STORE,
  SAMPLE_USERS,
  INITIAL_INVITATIONS,
  INITIAL_MEDICINES,
  INITIAL_INVENTORY,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_BILLS,
  INITIAL_NOTIFICATIONS,
  INITIAL_STOCK_MOVEMENTS,
  INITIAL_BRANCHES,
  INITIAL_STOCK_TRANSFERS,
} from '../lib/sampleData.ts';
import { branchTransferApi } from '../lib/branchTransferApi.ts';
import type { ApiSessionConfig } from '../lib/customerApi.ts';
import type {
  BankAccount,
  BankReconciliation,
  ChartOfAccount,
  ExpenseRecord,
  FinancialPeriod,
  JournalEntry,
} from '../lib/accountingApi.ts';
import {
  buildDefaultPreviewPeriods,
  DEFAULT_PREVIEW_BANK_ACCOUNTS,
  DEFAULT_PREVIEW_COA,
} from '../features/accounts/accountingPreviewEngine.ts';
import type { CustomerLedgerEntry, CustomerPayment } from '../types/pharmacy.ts';

interface PharmacyContextType {
  store: PharmacyStore;
  updateStore: (updated: Partial<PharmacyStore>) => void;
  currentUser: UserProfile;
  switchUserRole: (role: UserRole) => void;
  usersList: UserProfile[];
  apiSession: ApiSessionConfig;
  setApiSession: (updated: Partial<ApiSessionConfig>) => void;
  
  activeModule: NavigationModule;
  setActiveModule: (module: NavigationModule) => void;
  
  medicines: MedicineMaster[];
  addMedicine: (med: Omit<MedicineMaster, 'id'>) => MedicineMaster;
  updateMedicine: (id: string, updated: Partial<MedicineMaster>) => void;
  archiveMedicine: (id: string, archive?: boolean) => void;
  
  inventory: InventoryBatch[];
  allInventory: InventoryBatch[];
  addInventoryBatch: (batch: Omit<InventoryBatch, 'id' | 'status'>) => void;
  updateBatchStock: (batchId: string, newStock: number) => void;
  adjustBatchStock: (batchId: string, quantityChange: number, movementType: StockMovementType, reason: string) => void;
  stockMovements: StockMovement[];
  allStockMovements: StockMovement[];
  expiryWarningDays: number;
  setExpiryWarningDays: (days: number) => void;

  // Phase 10: Multi-Branch & Inter-Branch Stock Transfers
  branches: PharmacyBranch[];
  authorizedBranches: PharmacyBranch[];
  activeBranchId: string;
  activeBranch: PharmacyBranch | undefined;
  consolidatedViewMode: boolean;
  setConsolidatedViewMode: (enabled: boolean) => void;
  switchActiveBranch: (branchId: string) => void;
  branchAuditLogs: BranchAuditLogEntry[];
  createBranch: (payload: {
    branchCode: string;
    name: string;
    branchType?: PharmacyBranch['branchType'];
    address: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    gstin?: string | null;
    dlNumber20B?: string | null;
    dlNumber21B?: string | null;
    managerUserId?: string | null;
    managerName?: string | null;
    operatingHours?: string | null;
    isPrimary?: boolean;
    transferPolicy?: Partial<PharmacyBranch['transferPolicy']>;
  }) => Promise<{ ok: boolean; error?: string; branch?: PharmacyBranch }>;
  updateBranch: (branchId: string, updated: Partial<PharmacyBranch>) => Promise<{ ok: boolean; error?: string; branch?: PharmacyBranch }>;
  updateBranchSettings: (
    branchId: string,
    settings: Partial<PharmacyBranch['transferPolicy']> & { operatingHours?: string; timezone?: string }
  ) => Promise<{ ok: boolean; error?: string; branch?: PharmacyBranch }>;
  setPrimaryBranch: (branchId: string) => Promise<{ ok: boolean; error?: string }>;
  changeBranchStatus: (
    branchId: string,
    status: Exclude<BranchLifecycleStatus, 'CLOSED'>,
    reason?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  checkBranchClosure: (branchId: string) => Promise<BranchClosureCheck>;
  closeBranch: (branchId: string, closureNotes?: string) => Promise<{ ok: boolean; error?: string }>;
  assignEmployeeToBranch: (branchId: string, userId: string) => Promise<{ ok: boolean; error?: string }>;
  removeEmployeeFromBranch: (branchId: string, userId: string) => Promise<{ ok: boolean; error?: string }>;

  stockTransfers: StockTransfer[];
  createStockTransfer: (payload: {
    sourceBranchId: string;
    destinationBranchId: string;
    transferDate?: string;
    expectedDeliveryDate?: string;
    notes?: string;
    submitImmediately?: boolean;
    items: Array<{
      medicineId: string;
      sourceBatchId: string;
      requestedQuantity: number;
    }>;
  }) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  submitStockTransfer: (transferId: string) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  approveStockTransfer: (
    transferId: string,
    items?: Array<{ itemId: string; approvedQuantity: number }>
  ) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  rejectStockTransfer: (transferId: string, reason: string) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  cancelStockTransfer: (transferId: string, reason: string) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  dispatchStockTransfer: (
    transferId: string,
    payload: {
      dispatchReference?: string;
      transporterName?: string;
      vehicleNumber?: string;
      notes?: string;
      items?: Array<{ itemId: string; dispatchQuantity: number }>;
    }
  ) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  receiveStockTransfer: (
    transferId: string,
    payload: {
      notes?: string;
      items: Array<{
        itemId: string;
        receivedQuantity: number;
        damagedQuantity?: number;
        missingQuantity?: number;
        discrepancyReason?: string;
      }>;
    }
  ) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  reconcileStockTransfer: (
    transferId: string,
    reconciliationNotes: string
  ) => Promise<{ ok: boolean; error?: string; transfer?: StockTransfer }>;
  refreshMultiBranchData: () => Promise<void>;
  
  customers: Customer[];
  addCustomer: (cust: Omit<Customer, 'id' | 'totalVisits' | 'totalPurchased' | 'lastVisit'>) => Customer;
  updateCustomerRecord: (customerId: string, updated: Partial<Customer>) => void;
  updateCustomerKhata: (customerId: string, amountChange: number) => void;
  customerLedgerEntries: CustomerLedgerEntry[];
  appendCustomerLedgerEntry: (entry: CustomerLedgerEntry) => void;
  customerPayments: CustomerPayment[];
  appendCustomerPayment: (payment: CustomerPayment) => void;
  
  suppliers: Supplier[];
  addSupplier: (sup: Omit<Supplier, 'id'>) => Supplier;
  updateSupplierRecord: (supplierId: string, updated: Partial<Supplier>) => void;
  updateSupplierStatus: (supplierId: string, status: SupplierStatus, reason?: string) => void;
  archiveSupplier: (supplierId: string) => { ok: boolean; error?: string };

  purchaseOrders: PurchaseOrder[];
  createPurchaseOrder: (po: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt' | 'updatedAt' | 'createdBy'>) => PurchaseOrder;
  submitPurchaseOrder: (poId: string) => void;
  approvePurchaseOrder: (poId: string) => void;
  cancelPurchaseOrder: (poId: string, reason: string) => void;
  closePurchaseOrder: (poId: string, reason?: string) => void;

  goodsReceipts: GoodsReceiptNote[];
  postGoodsReceipt: (params: {
    poId?: string | null;
    supplierId: string;
    supplierInvoiceNumber?: string;
    supplierInvoiceDate?: string;
    shortExpiryWarningDays?: number;
    allowOverReceipt?: boolean;
    autoCreateInvoice?: boolean;
    notes?: string;
    items: Array<{
      poItemId?: string | null;
      medicineId: string;
      batchNumber: string;
      manufacturingDate?: string | null;
      expiryDate: string;
      acceptedQuantity: number;
      rejectedQuantity: number;
      freeQuantity?: number;
      rejectionReason?: string;
      purchasePrice: number;
      mrp: number;
      sellingPrice?: number;
      discountPercent?: number;
      gstRate?: number;
      rackLocation?: string;
    }>;
  }) => { ok: boolean; error?: string; grn?: GoodsReceiptNote; invoice?: SupplierInvoice | null };
  reverseGoodsReceipt: (grnId: string, reason: string) => { ok: boolean; error?: string };

  supplierInvoices: SupplierInvoice[];
  createSupplierInvoice: (params: {
    supplierId: string;
    grnId?: string | null;
    supplierInvoiceNumber: string;
    invoiceDate?: string;
    dueDate?: string;
    totalAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    notes?: string;
  }) => { ok: boolean; error?: string; invoice?: SupplierInvoice };

  supplierPayments: SupplierPayment[];
  recordSupplierPayment: (params: {
    supplierId: string;
    paymentMode: SupplierPaymentMode;
    amount: number;
    referenceNumber?: string;
    notes?: string;
    allocations?: Array<{ invoiceId: string; amount: number }>;
    allowAdvance?: boolean;
  }) => { ok: boolean; error?: string; payment?: SupplierPayment };

  supplierReturns: SupplierReturn[];
  createSupplierReturn: (params: {
    grnId: string;
    reason: string;
    items: Array<{ batchId: string; quantity: number; reason?: string }>;
  }) => { ok: boolean; error?: string; supplierReturn?: SupplierReturn };
  
  bills: BillInvoice[];
  allBills: BillInvoice[];
  createBill: (billData: Omit<BillInvoice, 'id' | 'invoiceNumber' | 'timestamp' | 'cashierName'>) => BillInvoice;
  cancelBill: (invoiceId: string, reason: string) => void;
  processSalesReturn: (invoiceId: string, items: Array<{ batchId: string; quantity: number; reason: string; restock: boolean }>, reason: string) => void;
  recordBillPayment: (invoiceId: string, payment: { mode: PaymentMode; amount: number; referenceNumber?: string }) => void;
  
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;

  // Phase 4: Staff & RBAC
  invitationsList: EmployeeInvitation[];
  inviteEmployee: (invite: {
    email: string;
    name: string;
    phone?: string;
    role: UserRole;
    assignedBranchIds: string[];
    permissionOverrides?: { granted?: string[]; revoked?: string[] };
  }) => EmployeeInvitation;
  resendInvitation: (invitationId: string) => void;
  cancelInvitation: (invitationId: string) => void;
  updateEmployeeRole: (userId: string, newRole: UserRole) => void;
  updateEmployeeBranches: (userId: string, branches: string[]) => void;
  updateEmployeePermissions: (userId: string, overrides: { granted?: string[]; revoked?: string[] }) => void;
  updateEmployeeStatus: (userId: string, status: 'active' | 'suspended' | 'deactivated') => void;
  hasUserPermission: (permissionKey: string) => boolean;
  
  // UI Modal triggers
  isStoreOnboardingOpen: boolean;
  setIsStoreOnboardingOpen: (open: boolean) => void;
  isLoginModalOpen: boolean;
  setIsLoginModalOpen: (open: boolean) => void;
  activeQuickModal: 'medicine' | 'customer' | 'stock' | null;
  setActiveQuickModal: (modal: 'medicine' | 'customer' | 'stock' | null) => void;
  printInvoiceData: BillInvoice | null;
  setPrintInvoiceData: (invoice: BillInvoice | null) => void;

  // Ephemeral preview accounting state (used only when Firebase bearerToken is absent)
  previewAccounts: ChartOfAccount[];
  setPreviewAccounts: React.Dispatch<React.SetStateAction<ChartOfAccount[]>>;
  previewExpenses: ExpenseRecord[];
  setPreviewExpenses: React.Dispatch<React.SetStateAction<ExpenseRecord[]>>;
  previewManualJournals: JournalEntry[];
  setPreviewManualJournals: React.Dispatch<React.SetStateAction<JournalEntry[]>>;
  previewBankAccounts: BankAccount[];
  setPreviewBankAccounts: React.Dispatch<React.SetStateAction<BankAccount[]>>;
  previewReconciliations: BankReconciliation[];
  setPreviewReconciliations: React.Dispatch<React.SetStateAction<BankReconciliation[]>>;
  previewPeriods: FinancialPeriod[];
  setPreviewPeriods: React.Dispatch<React.SetStateAction<FinancialPeriod[]>>;
}

const PharmacyContext = createContext<PharmacyContextType | undefined>(undefined);

export const PharmacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Ephemeral client UI session state; authoritative business records persist in Cloud Firestore via /api/v1
  const [store, setStore] = useState<PharmacyStore>(INITIAL_STORE);
  const [currentUser, setCurrentUser] = useState<UserProfile>(SAMPLE_USERS[0]);
  const [activeModule, setActiveModule] = useState<NavigationModule>('dashboard');
  const [apiSession, setApiSessionState] = useState<ApiSessionConfig>({
    bearerToken: null,
    tenantId: INITIAL_STORE.id,
    branchId: 'main',
    appCheckToken: null,
  });

  const setApiSession = (updated: Partial<ApiSessionConfig>) => {
    setApiSessionState(prev => ({ ...prev, ...updated }));
  };

  const [branches, setBranches] = useState<PharmacyBranch[]>(INITIAL_BRANCHES);
  const [activeBranchId, setActiveBranchId] = useState<string>('main');
  const [consolidatedViewMode, setConsolidatedViewMode] = useState<boolean>(false);
  const [branchAuditLogs, setBranchAuditLogs] = useState<BranchAuditLogEntry[]>([]);
  const [stockTransfers, setStockTransfers] = useState<StockTransfer[]>(INITIAL_STOCK_TRANSFERS);

  const [medicines, setMedicines] = useState<MedicineMaster[]>(INITIAL_MEDICINES);
  const [allInventory, setAllInventory] = useState<InventoryBatch[]>(INITIAL_INVENTORY);
  const setInventory = setAllInventory;
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [customerLedgerEntries, setCustomerLedgerEntries] = useState<CustomerLedgerEntry[]>([
    {
      id: 'led-init-02-open',
      tenantId: 'store-01',
      branchId: 'main',
      customerId: 'cust-02',
      entryType: 'OPENING_BALANCE',
      direction: 'DEBIT',
      amount: 266,
      appliedToBalance: 266,
      advanceDelta: 0,
      previousBalance: 0,
      runningBalance: 266,
      previousAdvanceBalance: 0,
      runningAdvanceBalance: 0,
      referenceType: 'opening_balance',
      referenceId: 'cust-02',
      description: 'Previous prescription due balance',
      reason: 'Carried forward balance',
      performedBy: 'user-01',
      performedByName: 'Suresh Patel',
      timestamp: '2026-10-20T10:00:00.000Z',
    },
    {
      id: 'led-init-02-inv',
      tenantId: 'store-01',
      branchId: 'main',
      customerId: 'cust-02',
      entryType: 'CREDIT_PURCHASE',
      direction: 'DEBIT',
      amount: 184,
      appliedToBalance: 184,
      advanceDelta: 0,
      previousBalance: 266,
      runningBalance: 450,
      previousAdvanceBalance: 0,
      runningAdvanceBalance: 0,
      referenceType: 'sales_invoice',
      referenceId: 'bill-03',
      invoiceId: 'bill-03',
      invoiceNumber: 'AMB-2026-1046',
      description: 'Credit purchase on Invoice AMB-2026-1046',
      reason: 'POS credit sale',
      performedBy: 'user-03',
      performedByName: 'Rohan Sharma',
      timestamp: '2026-11-04T18:30:00.000Z',
    },
    {
      id: 'led-init-03-open',
      tenantId: 'store-01',
      branchId: 'main',
      customerId: 'cust-03',
      entryType: 'CREDIT_PURCHASE',
      direction: 'DEBIT',
      amount: 1200,
      appliedToBalance: 1200,
      advanceDelta: 0,
      previousBalance: 0,
      runningBalance: 1200,
      previousAdvanceBalance: 0,
      runningAdvanceBalance: 0,
      referenceType: 'opening_balance',
      referenceId: 'cust-03',
      description: 'Monthly insulin dispense Khata account',
      reason: 'Active monthly credit cycle',
      performedBy: 'user-02',
      performedByName: 'Pooja Deshmukh (B.Pharm)',
      timestamp: '2026-11-01T11:15:00.000Z',
    },
    {
      id: 'led-init-04-adv',
      tenantId: 'store-01',
      branchId: 'main',
      customerId: 'cust-04',
      entryType: 'UPI_PAYMENT',
      direction: 'CREDIT',
      amount: 250,
      appliedToBalance: 0,
      advanceDelta: 250,
      previousBalance: 0,
      runningBalance: 0,
      previousAdvanceBalance: 0,
      runningAdvanceBalance: 250,
      referenceType: 'khata_payment',
      referenceId: 'kpay-init-04',
      paymentId: 'kpay-init-04',
      paymentMode: 'upi',
      referenceNumber: 'UPI-40991122',
      description: 'Advance UPI deposit (RCP-2026-000098)',
      reason: 'Customer advance deposit',
      performedBy: 'user-03',
      performedByName: 'Rohan Sharma',
      timestamp: '2026-10-28T16:20:00.000Z',
    },
    {
      id: 'led-init-05-open',
      tenantId: 'store-01',
      branchId: 'main',
      customerId: 'cust-05',
      entryType: 'OPENING_BALANCE',
      direction: 'DEBIT',
      amount: 850,
      appliedToBalance: 850,
      advanceDelta: 0,
      previousBalance: 0,
      runningBalance: 850,
      previousAdvanceBalance: 0,
      runningAdvanceBalance: 0,
      referenceType: 'opening_balance',
      referenceId: 'cust-05',
      description: 'Weekly commercial account due',
      reason: 'Opening balance carried forward',
      performedBy: 'user-01',
      performedByName: 'Suresh Patel',
      timestamp: '2026-10-25T14:00:00.000Z',
    },
  ]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([
    {
      id: 'kpay-init-04',
      receiptNumber: 'RCP-2026-000098',
      tenantId: 'store-01',
      branchId: 'main',
      customerId: 'cust-04',
      customerName: 'Meera Iyer',
      amount: 250,
      appliedToBalance: 0,
      addedToAdvance: 250,
      paymentMode: 'upi',
      referenceNumber: 'UPI-40991122',
      paymentDate: '2026-10-28T16:20:00.000Z',
      allocations: [],
      notes: 'Advance deposit for upcoming prescription refill',
      recordedBy: 'user-03',
      recordedByName: 'Rohan Sharma',
      ledgerEntryId: 'led-init-04-adv',
      timestamp: '2026-10-28T16:20:00.000Z',
    },
  ]);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([
    {
      id: 'po-init-01',
      poNumber: 'PO-2026-0001',
      tenantId: 'store-01',
      branchId: 'main',
      supplierId: 'sup-01',
      supplierCode: 'SUP-0001',
      supplierName: 'Mahalaxmi Pharma Distributors',
      supplierGstin: '27AAECM4019C1Z4',
      supplierStateCode: '27',
      tenantStateCode: '27',
      placeOfSupplyStateCode: '27',
      isInterState: false,
      orderDate: '2026-11-01T10:00:00.000Z',
      expectedDeliveryDate: '2026-11-04',
      status: 'APPROVED',
      items: [
        {
          id: 'poi-init-01',
          medicineId: 'med-01',
          medicineName: 'Dolo 650 Tablet',
          genericName: 'Paracetamol (650mg)',
          brand: 'Micro Labs Ltd',
          packSize: '15 Tablets',
          hsnCode: '300490',
          orderedQuantity: 40,
          freeQuantity: 2,
          receivedQuantity: 0,
          rejectedQuantity: 0,
          pendingQuantity: 40,
          unitCost: 26.2,
          mrp: 34.5,
          discountPercent: 0,
          discountAmount: 0,
          taxableAmount: 1048,
          gstRate: 12,
          cgst: 62.88,
          sgst: 62.88,
          igst: 0,
          lineTotal: 1173.76,
        },
        {
          id: 'poi-init-02',
          medicineId: 'med-02',
          medicineName: 'Augmentin 625 Duo Tablet',
          genericName: 'Amoxicillin (500mg) + Clavulanic Acid (125mg)',
          brand: 'GSK Pharmaceuticals',
          packSize: '10 Tablets',
          hsnCode: '300420',
          orderedQuantity: 20,
          freeQuantity: 0,
          receivedQuantity: 0,
          rejectedQuantity: 0,
          pendingQuantity: 20,
          unitCost: 158,
          mrp: 204.3,
          discountPercent: 5,
          discountAmount: 158,
          taxableAmount: 3002,
          gstRate: 12,
          cgst: 180.12,
          sgst: 180.12,
          igst: 0,
          lineTotal: 3362.24,
        },
      ],
      subtotal: 4208,
      totalDiscount: 158,
      invoiceDiscount: 0,
      otherCharges: 0,
      taxableAmount: 4050,
      cgst: 243,
      sgst: 243,
      igst: 0,
      totalTax: 486,
      roundOff: 0,
      grandTotal: 4536,
      totalOrderedQty: 60,
      totalReceivedQty: 0,
      totalPendingQty: 60,
      paymentTerms: 'Net 21 days',
      approvedBy: 'Suresh Patel',
      approvedAt: '2026-11-01T11:30:00.000Z',
      createdBy: 'Suresh Patel',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T11:30:00.000Z',
    },
  ]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceiptNote[]>([]);
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierInvoice[]>([
    {
      id: 'sinv-init-01',
      tenantId: 'store-01',
      branchId: 'main',
      supplierId: 'sup-01',
      supplierCode: 'SUP-0001',
      supplierName: 'Mahalaxmi Pharma Distributors',
      supplierGstin: '27AAECM4019C1Z4',
      supplierInvoiceNumber: 'MPD/26-27/1840',
      invoiceDate: '2026-10-18T09:00:00.000Z',
      dueDate: '2026-11-08T09:00:00.000Z',
      placeOfSupplyStateCode: '27',
      isInterState: false,
      subtotal: 30803.57,
      totalDiscount: 0,
      otherCharges: 0,
      taxableAmount: 30803.57,
      cgst: 1848.21,
      sgst: 1848.22,
      igst: 0,
      totalTax: 3696.43,
      roundOff: 0,
      totalAmount: 34500,
      amountPaid: 0,
      creditNoteAmount: 0,
      outstandingAmount: 34500,
      paymentStatus: 'UNPAID',
      recognitionBasis: 'DIRECT_BILL',
      createdAt: '2026-10-18T09:00:00.000Z',
    },
  ]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [supplierReturns, setSupplierReturns] = useState<SupplierReturn[]>([]);
  const [allBills, setAllBills] = useState<BillInvoice[]>(INITIAL_BILLS);
  const setBills = setAllBills;
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Employee & RBAC State
  const [usersList, setUsersList] = useState<UserProfile[]>(SAMPLE_USERS);
  const [invitationsList, setInvitationsList] = useState<EmployeeInvitation[]>(INITIAL_INVITATIONS);

  // Modals
  const [isStoreOnboardingOpen, setIsStoreOnboardingOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [activeQuickModal, setActiveQuickModal] = useState<'medicine' | 'customer' | 'stock' | null>(null);
  const [printInvoiceData, setPrintInvoiceData] = useState<BillInvoice | null>(null);

  // Inventory Movements & Expiry Warning Threshold
  const [allStockMovements, setAllStockMovements] = useState<StockMovement[]>(INITIAL_STOCK_MOVEMENTS);
  const setStockMovements = setAllStockMovements;
  const [expiryWarningDays, setExpiryWarningDays] = useState<number>(90);

  const authorizedBranches = useMemo(() => {
    if (currentUser.role === 'owner' || currentUser.assignedBranchIds?.includes('*')) {
      return branches;
    }
    const allowed = new Set(currentUser.assignedBranchIds || ['main']);
    const matched = branches.filter(b => allowed.has(b.id));
    return matched.length > 0 ? matched : branches.slice(0, 1);
  }, [branches, currentUser.role, currentUser.assignedBranchIds]);

  const activeBranch = useMemo(
    () => branches.find(b => b.id === activeBranchId) || branches[0],
    [branches, activeBranchId]
  );

  const inventory = useMemo(() => {
    if (consolidatedViewMode) return allInventory;
    return allInventory.filter(b => (b.branchId || 'main') === activeBranchId);
  }, [allInventory, activeBranchId, consolidatedViewMode]);

  const bills = useMemo(() => {
    if (consolidatedViewMode) return allBills;
    return allBills.filter(b => (b.branchId || 'main') === activeBranchId);
  }, [allBills, activeBranchId, consolidatedViewMode]);

  const stockMovements = useMemo(() => {
    if (consolidatedViewMode) return allStockMovements;
    return allStockMovements.filter(m => (m.branchId || 'main') === activeBranchId);
  }, [allStockMovements, activeBranchId, consolidatedViewMode]);

  const refreshMultiBranchData = useCallback(async () => {
    if (!apiSession.bearerToken) return;
    try {
      const [authList, allList, transferList, auditList] = await Promise.all([
        branchTransferApi.listAuthorizedBranches(apiSession).catch(() => []),
        branchTransferApi.listBranches(apiSession).catch(() => []),
        branchTransferApi.listStockTransfers(apiSession).catch(() => []),
        branchTransferApi.listBranchAuditLogs(apiSession).catch(() => []),
      ]);
      if (allList.length > 0) {
        setBranches(allList);
      } else if (authList.length > 0) {
        setBranches(authList);
      }
      if (transferList.length > 0 || apiSession.bearerToken) {
        setStockTransfers(transferList);
      }
      if (auditList.length > 0) {
        setBranchAuditLogs(auditList);
      }
    } catch {
      // Keep local workspace state resilient on transient network errors
    }
  }, [apiSession]);

  useEffect(() => {
    if (apiSession.bearerToken) {
      void refreshMultiBranchData();
    }
  }, [apiSession.bearerToken, apiSession.tenantId, refreshMultiBranchData]);

  const switchActiveBranch = (branchId: string) => {
    const target = authorizedBranches.find(b => b.id === branchId) || branches.find(b => b.id === branchId);
    if (!target) return;
    setConsolidatedViewMode(false);
    setActiveBranchId(target.id);
    setApiSessionState(prev => ({ ...prev, branchId: target.id }));
    setStore(prev => ({ ...prev, branchName: target.name }));
    setPrintInvoiceData(null);
  };

  // Ephemeral Phase 9 accounting preview state (zero localStorage; backend Firestore is authoritative)
  const [previewAccounts, setPreviewAccounts] = useState<ChartOfAccount[]>(DEFAULT_PREVIEW_COA);
  const [previewExpenses, setPreviewExpenses] = useState<ExpenseRecord[]>([
    {
      id: 'exp-init-rent',
      tenantId: 'store-01',
      branchId: 'main',
      expenseNumber: 'EXP-2026-0001',
      expenseDate: '2026-11-01',
      categoryAccountId: 'coa_5210',
      categoryAccountCode: '5210',
      categoryAccountName: 'Shop Rent & Lease',
      vendorName: 'Shreeji Commercial Premises LLP',
      vendorGstin: '27AABCS1429B1Z5',
      invoiceNumber: 'RENT/NOV/26',
      taxableAmount: 18000,
      cgst: 1620,
      sgst: 1620,
      igst: 0,
      itcEligible: true,
      totalAmount: 21240,
      paidAmount: 21240,
      outstandingAmount: 0,
      status: 'PAID',
      approvalStatus: 'APPROVED',
      paymentMode: 'BANK_TRANSFER',
      paymentAccountId: 'coa_1200',
      paymentReference: 'NEFT-884120',
      receiptAttachmentPath: null,
      notes: 'November store lease rent with eligible GST ITC',
      recognitionJournalId: 'je_exp_exp-init-rent',
      paymentJournalId: 'je_exp_exp-init-rent',
      reversalJournalId: null,
      approvedBy: 'user-01',
      approvedAt: '2026-11-01T10:00:00.000Z',
      paidAt: '2026-11-01T10:00:00.000Z',
      createdBy: 'user-01',
      createdAt: '2026-11-01T10:00:00.000Z',
      updatedAt: '2026-11-01T10:00:00.000Z',
    },
    {
      id: 'exp-init-power',
      tenantId: 'store-01',
      branchId: 'main',
      expenseNumber: 'EXP-2026-0002',
      expenseDate: '2026-11-05',
      categoryAccountId: 'coa_5230',
      categoryAccountCode: '5230',
      categoryAccountName: 'Electricity & Cold-Chain Utilities',
      vendorName: 'Adani Electricity Mumbai',
      vendorGstin: null,
      invoiceNumber: 'AEM-990211',
      taxableAmount: 3850,
      cgst: 0,
      sgst: 0,
      igst: 0,
      itcEligible: false,
      totalAmount: 3850,
      paidAmount: 0,
      outstandingAmount: 3850,
      status: 'APPROVED_UNPAID',
      approvalStatus: 'APPROVED',
      paymentMode: 'UNPAID',
      paymentAccountId: null,
      paymentReference: null,
      receiptAttachmentPath: null,
      notes: 'Cold-chain insulin fridge electricity bill due 20th',
      recognitionJournalId: 'je_exp_exp-init-power',
      paymentJournalId: null,
      reversalJournalId: null,
      approvedBy: 'user-01',
      approvedAt: '2026-11-05T11:00:00.000Z',
      paidAt: null,
      createdBy: 'user-02',
      createdAt: '2026-11-05T11:00:00.000Z',
      updatedAt: '2026-11-05T11:00:00.000Z',
    },
  ]);
  const [previewManualJournals, setPreviewManualJournals] = useState<JournalEntry[]>([]);
  const [previewBankAccounts, setPreviewBankAccounts] = useState<BankAccount[]>(DEFAULT_PREVIEW_BANK_ACCOUNTS);
  const [previewReconciliations, setPreviewReconciliations] = useState<BankReconciliation[]>([]);
  const [previewPeriods, setPreviewPeriods] = useState<FinancialPeriod[]>(buildDefaultPreviewPeriods);

  const updateStore = (updated: Partial<PharmacyStore>) => {
    setStore(prev => ({ ...prev, ...updated }));
  };

  const switchUserRole = (role: UserRole) => {
    const targetUser = usersList.find(u => u.role === role) || SAMPLE_USERS.find(u => u.role === role) || SAMPLE_USERS[0];
    setCurrentUser(targetUser);
    if (
      targetUser.role !== 'owner' &&
      !targetUser.assignedBranchIds?.includes('*') &&
      targetUser.assignedBranchIds &&
      targetUser.assignedBranchIds.length > 0 &&
      !targetUser.assignedBranchIds.includes(activeBranchId)
    ) {
      const firstBranch = branches.find(b => targetUser.assignedBranchIds?.includes(b.id)) || branches[0];
      if (firstBranch) {
        setConsolidatedViewMode(false);
        setActiveBranchId(firstBranch.id);
        setApiSessionState(prev => ({ ...prev, branchId: firstBranch.id }));
        setStore(prev => ({ ...prev, branchName: firstBranch.name }));
      }
    }
  };

  const addMedicine = (med: Omit<MedicineMaster, 'id'>) => {
    const newMed: MedicineMaster = {
      ...med,
      id: `med-${Date.now().toString(36)}`,
      status: med.status || 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUser.name,
    };
    setMedicines(prev => [newMed, ...prev]);
    return newMed;
  };

  const updateMedicine = (id: string, updated: Partial<MedicineMaster>) => {
    setMedicines(prev =>
      prev.map(m =>
        m.id === id
          ? {
              ...m,
              ...updated,
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
  };

  const archiveMedicine = (id: string, archive: boolean = true) => {
    setMedicines(prev =>
      prev.map(m =>
        m.id === id
          ? {
              ...m,
              status: archive ? 'archived' : 'active',
              updatedAt: new Date().toISOString(),
            }
          : m
      )
    );
  };

  const addInventoryBatch = (batchData: Omit<InventoryBatch, 'id' | 'status'>) => {
    const today = new Date();
    const expiry = new Date(batchData.expiryDate + '-01');
    const diffMonths = (expiry.getFullYear() - today.getFullYear()) * 12 + (expiry.getMonth() - today.getMonth());
    
    let status: 'normal' | 'low_stock' | 'near_expiry' | 'expired' | 'out_of_stock' = 'normal';
    if (batchData.currentStock <= 0) {
      status = 'out_of_stock';
    } else if (diffMonths <= 0) {
      status = 'expired';
    } else if (diffMonths <= Math.round(expiryWarningDays / 30)) {
      status = 'near_expiry';
    } else if (batchData.currentStock <= 10) {
      status = 'low_stock';
    }

    const batchId = `batch-${Date.now().toString(36)}`;
    const branchId = batchData.branchId || activeBranchId || 'main';

    const newBatch: InventoryBatch = {
      ...batchData,
      id: batchId,
      branchId,
      status,
      sellingPrice: batchData.sellingPrice || batchData.mrp,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setInventory(prev => [newBatch, ...prev]);

    // Record opening stock movement
    const movement: StockMovement = {
      id: `mov-${Date.now().toString(36)}`,
      branchId,
      medicineId: batchData.medicineId,
      batchId,
      batchNumber: batchData.batchNumber,
      medicineName: batchData.brandName,
      movementType: 'OPENING_STOCK',
      quantityChange: batchData.currentStock,
      previousQuantity: 0,
      newQuantity: batchData.currentStock,
      referenceType: 'opening_stock',
      referenceId: batchId,
      reason: 'Batch inward / opening stock entry',
      performedBy: currentUser.name,
      timestamp: new Date().toISOString(),
    };

    setStockMovements(prev => [movement, ...prev]);
  };

  const updateBatchStock = (batchId: string, newStock: number) => {
    setInventory(prev =>
      prev.map(b => {
        if (b.id !== batchId) return b;
        const validStock = Math.max(0, newStock);
        const status = validStock === 0 ? 'out_of_stock' : validStock <= 10 ? 'low_stock' : b.status === 'low_stock' ? 'normal' : b.status;
        return { ...b, currentStock: validStock, status, updatedAt: new Date().toISOString() };
      })
    );
  };

  const adjustBatchStock = (
    batchId: string,
    quantityChange: number,
    movementType: StockMovementType,
    reason: string
  ) => {
    const target = allInventory.find(b => b.id === batchId);
    if (!target) return;

    const previousQuantity = target.currentStock;
    const newQuantity = Math.max(0, previousQuantity + quantityChange);

    updateBatchStock(batchId, newQuantity);

    const movement: StockMovement = {
      id: `mov-${Date.now().toString(36)}`,
      branchId: target.branchId || activeBranchId || 'main',
      medicineId: target.medicineId,
      batchId: target.id,
      batchNumber: target.batchNumber,
      medicineName: target.brandName,
      movementType,
      quantityChange,
      previousQuantity,
      newQuantity,
      referenceType: 'adjustment',
      referenceId: batchId,
      reason,
      performedBy: currentUser.name,
      timestamp: new Date().toISOString(),
    };

    setStockMovements(prev => [movement, ...prev]);
  };

  const addCustomer = (custData: Omit<Customer, 'id' | 'totalVisits' | 'totalPurchased' | 'lastVisit'>) => {
    const newId = `cust-${Date.now().toString(36)}`;
    const nowIso = new Date().toISOString();
    const openingBal = Math.max(0, Number(custData.khataBalance) || 0);
    const newCustomer: Customer = {
      ...custData,
      id: newId,
      customerType: custData.customerType || 'REGULAR',
      creditEnabled: custData.creditEnabled ?? true,
      creditLimit: custData.creditLimit ?? 5000,
      creditTermsDays: custData.creditTermsDays ?? 15,
      advanceBalance: custData.advanceBalance ?? 0,
      status: custData.status || 'ACTIVE',
      isArchived: custData.isArchived ?? false,
      totalVisits: 0,
      totalPurchased: 0,
      totalPayments: 0,
      lastVisit: nowIso.split('T')[0],
    };
    setCustomers(prev => [newCustomer, ...prev]);

    if (openingBal > 0) {
      setCustomerLedgerEntries(prev => [
        {
          id: `led-${Date.now().toString(36)}`,
          tenantId: store.id,
          branchId: 'main',
          customerId: newId,
          entryType: 'OPENING_BALANCE',
          direction: 'DEBIT',
          amount: openingBal,
          appliedToBalance: openingBal,
          advanceDelta: 0,
          previousBalance: 0,
          runningBalance: openingBal,
          previousAdvanceBalance: 0,
          runningAdvanceBalance: 0,
          referenceType: 'opening_balance',
          referenceId: newId,
          description: 'Opening Khata balance carried forward',
          reason: 'Customer onboarding',
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          timestamp: nowIso,
        },
        ...prev,
      ]);
    }
    return newCustomer;
  };

  const updateCustomerRecord = (customerId: string, updated: Partial<Customer>) => {
    setCustomers(prev => prev.map(c => (c.id === customerId ? { ...c, ...updated } : c)));
  };

  const appendCustomerLedgerEntry = (entry: CustomerLedgerEntry) => {
    setCustomerLedgerEntries(prev => [entry, ...prev]);
  };

  const appendCustomerPayment = (payment: CustomerPayment) => {
    setCustomerPayments(prev => [payment, ...prev]);
  };

  const updateCustomerKhata = (customerId: string, amountChange: number) => {
    setCustomers(prev =>
      prev.map(c =>
        c.id === customerId
          ? { ...c, khataBalance: Math.max(0, Math.round((c.khataBalance + amountChange) * 100) / 100) }
          : c
      )
    );
  };

  const addSupplier = (supData: Omit<Supplier, 'id'>) => {
    const newSupplier: Supplier = {
      ...supData,
      supplierCode: supData.supplierCode || `SUP-${String(suppliers.length + 1).padStart(4, '0')}`,
      status: supData.status || 'ACTIVE',
      isArchived: false,
      id: `sup-${Date.now().toString(36)}`,
    };
    setSuppliers(prev => [newSupplier, ...prev]);
    return newSupplier;
  };

  const updateSupplierRecord = (supplierId: string, updated: Partial<Supplier>) => {
    setSuppliers(prev => prev.map(s => (s.id === supplierId ? { ...s, ...updated } : s)));
  };

  const updateSupplierStatus = (supplierId: string, status: SupplierStatus, reason?: string) => {
    setSuppliers(prev =>
      prev.map(s =>
        s.id === supplierId
          ? {
              ...s,
              status,
              isArchived: status === 'ACTIVE' ? false : s.isArchived,
              blockReason: status === 'BLOCKED' ? reason || 'Blocked by administration' : null,
            }
          : s
      )
    );
  };

  const archiveSupplier = (supplierId: string): { ok: boolean; error?: string } => {
    const target = suppliers.find(s => s.id === supplierId);
    if (!target) return { ok: false, error: 'Supplier not found' };
    if ((target.outstandingBalance || 0) > 0) {
      return {
        ok: false,
        error: `Cannot archive supplier while outstanding payable is ₹${target.outstandingBalance.toFixed(2)}.`,
      };
    }
    setSuppliers(prev =>
      prev.map(s => (s.id === supplierId ? { ...s, status: 'INACTIVE', isArchived: true } : s))
    );
    return { ok: true };
  };

  const createPurchaseOrder = (
    poInput: Omit<PurchaseOrder, 'id' | 'poNumber' | 'createdAt' | 'updatedAt' | 'createdBy'>
  ) => {
    const now = new Date().toISOString();
    const poNumber = `PO-${new Date().getFullYear()}-${String(purchaseOrders.length + 1).padStart(4, '0')}`;
    const created: PurchaseOrder = {
      ...poInput,
      id: `po-${Date.now().toString(36)}`,
      poNumber,
      createdBy: currentUser.name,
      createdAt: now,
      updatedAt: now,
    };
    setPurchaseOrders(prev => [created, ...prev]);
    return created;
  };

  const submitPurchaseOrder = (poId: string) => {
    setPurchaseOrders(prev =>
      prev.map(po =>
        po.id === poId && po.status === 'DRAFT'
          ? { ...po, status: 'PENDING_APPROVAL', updatedAt: new Date().toISOString() }
          : po
      )
    );
  };

  const approvePurchaseOrder = (poId: string) => {
    const now = new Date().toISOString();
    setPurchaseOrders(prev =>
      prev.map(po =>
        po.id === poId && (po.status === 'DRAFT' || po.status === 'PENDING_APPROVAL')
          ? { ...po, status: 'APPROVED', approvedBy: currentUser.name, approvedAt: now, updatedAt: now }
          : po
      )
    );
  };

  const cancelPurchaseOrder = (poId: string, reason: string) => {
    const now = new Date().toISOString();
    setPurchaseOrders(prev =>
      prev.map(po =>
        po.id === poId && po.totalReceivedQty === 0
          ? { ...po, status: 'CANCELLED', cancellationReason: reason, updatedAt: now }
          : po
      )
    );
  };

  const closePurchaseOrder = (poId: string, reason?: string) => {
    const now = new Date().toISOString();
    setPurchaseOrders(prev =>
      prev.map(po =>
        po.id === poId
          ? { ...po, status: 'CLOSED', closureReason: reason || 'Short-closed', updatedAt: now }
          : po
      )
    );
  };

  const postGoodsReceipt = (params: {
    poId?: string | null;
    supplierId: string;
    supplierInvoiceNumber?: string;
    supplierInvoiceDate?: string;
    shortExpiryWarningDays?: number;
    allowOverReceipt?: boolean;
    autoCreateInvoice?: boolean;
    notes?: string;
    items: Array<{
      poItemId?: string | null;
      medicineId: string;
      batchNumber: string;
      manufacturingDate?: string | null;
      expiryDate: string;
      acceptedQuantity: number;
      rejectedQuantity: number;
      freeQuantity?: number;
      rejectionReason?: string;
      purchasePrice: number;
      mrp: number;
      sellingPrice?: number;
      discountPercent?: number;
      gstRate?: number;
      rackLocation?: string;
    }>;
  }): { ok: boolean; error?: string; grn?: GoodsReceiptNote; invoice?: SupplierInvoice | null } => {
    const supplier = suppliers.find(s => s.id === params.supplierId);
    if (!supplier) return { ok: false, error: 'Selected supplier not found.' };
    if (supplier.status === 'BLOCKED') {
      return { ok: false, error: `Supplier '${supplier.agencyName}' is BLOCKED.` };
    }

    const po = params.poId ? purchaseOrders.find(p => p.id === params.poId) : undefined;
    if (po && po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
      return { ok: false, error: `PO '${po.poNumber}' is in ${po.status} state and cannot receive stock.` };
    }

    const warnDays = params.shortExpiryWarningDays ?? expiryWarningDays ?? 90;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Aggregate per PO line to verify no unauthorized over-receipt
    const addByPoItem = new Map<string, number>();
    const rejByPoItem = new Map<string, number>();
    for (const item of params.items) {
      if (item.acceptedQuantity < 0 || item.rejectedQuantity < 0) {
        return { ok: false, error: 'Quantities cannot be negative.' };
      }
      if (item.acceptedQuantity + item.rejectedQuantity <= 0) {
        return { ok: false, error: 'Received quantity must be positive.' };
      }
      if (item.rejectedQuantity > 0 && !item.rejectionReason?.trim()) {
        return { ok: false, error: 'Rejection reason is required for rejected stock.' };
      }
      if (item.mrp < item.purchasePrice) {
        return { ok: false, error: `MRP cannot be lower than PTR for batch ${item.batchNumber}.` };
      }
      const exp =
        item.expiryDate.length === 7
          ? new Date(Number(item.expiryDate.split('-')[0]), Number(item.expiryDate.split('-')[1]), 0)
          : new Date(item.expiryDate);
      if (exp.getTime() < today.getTime() && item.acceptedQuantity > 0) {
        return { ok: false, error: `Expired batch '${item.batchNumber}' cannot be accepted into saleable stock.` };
      }
      if (item.manufacturingDate) {
        const mfg = new Date(item.manufacturingDate);
        if (mfg.getTime() > Date.now() || mfg.getTime() > exp.getTime()) {
          return { ok: false, error: `Invalid manufacturing date on batch '${item.batchNumber}'.` };
        }
      }
      if (po && item.poItemId) {
        addByPoItem.set(item.poItemId, (addByPoItem.get(item.poItemId) || 0) + item.acceptedQuantity);
        rejByPoItem.set(item.poItemId, (rejByPoItem.get(item.poItemId) || 0) + item.rejectedQuantity);
      }
    }

    if (po && !params.allowOverReceipt) {
      for (const [lineId, qty] of addByPoItem.entries()) {
        const poLine = po.items.find(l => l.id === lineId);
        if (poLine && poLine.receivedQuantity + qty > poLine.orderedQuantity) {
          return {
            ok: false,
            error: `Over-receipt blocked for ${poLine.medicineName}: pending is ${poLine.pendingQuantity}, attempting ${qty}.`,
          };
        }
      }
    }

    const now = new Date().toISOString();
    const grnId = `grn-${Date.now().toString(36)}`;
    const grnNumber = `GRN-${new Date().getFullYear()}-${String(goodsReceipts.length + 1).padStart(4, '0')}`;
    const isInterState = po
      ? po.isInterState
      : Boolean(supplier.stateCode && supplier.stateCode !== (store.gstin?.slice(0, 2) || '27'));

    const warnings: GoodsReceiptNote['warnings'] = [];
    const newBatches: InventoryBatch[] = [];
    const newMovements: StockMovement[] = [];
    const grnLines: GoodsReceiptNote['items'] = [];

    let subtotal = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    params.items.forEach((item, idx) => {
      const med = medicines.find(m => m.id === item.medicineId);
      const gstRate = item.gstRate ?? med?.gstSlab ?? 12;
      const discPct = item.discountPercent ?? 0;
      const gross = Math.round(item.acceptedQuantity * item.purchasePrice * 100) / 100;
      const discAmt = Math.round(gross * (discPct / 100) * 100) / 100;
      const lineTaxable = Math.round((gross - discAmt) * 100) / 100;
      const taxAmt = Math.round((lineTaxable * gstRate) / 100 * 100) / 100;
      const lineIgst = isInterState ? taxAmt : 0;
      const lineCgst = isInterState ? 0 : Math.round((taxAmt / 2) * 100) / 100;
      const lineSgst = isInterState ? 0 : Math.round((taxAmt - lineCgst) * 100) / 100;
      const lineTotal = Math.round((lineTaxable + taxAmt) * 100) / 100;

      subtotal = Math.round((subtotal + gross) * 100) / 100;
      totalDiscount = Math.round((totalDiscount + discAmt) * 100) / 100;
      taxableAmount = Math.round((taxableAmount + lineTaxable) * 100) / 100;
      cgst = Math.round((cgst + lineCgst) * 100) / 100;
      sgst = Math.round((sgst + lineSgst) * 100) / 100;
      igst = Math.round((igst + lineIgst) * 100) / 100;

      const exp =
        item.expiryDate.length === 7
          ? new Date(Number(item.expiryDate.split('-')[0]), Number(item.expiryDate.split('-')[1]), 0)
          : new Date(item.expiryDate);
      const daysRemaining = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const shortExpiryWarning = item.acceptedQuantity > 0 && daysRemaining <= warnDays;

      if (shortExpiryWarning) {
        warnings.push({
          medicineId: item.medicineId,
          medicineName: med?.brandName || item.medicineId,
          batchNumber: item.batchNumber.toUpperCase(),
          expiryDate: item.expiryDate,
          daysRemaining,
          message: `Short expiry (${daysRemaining}d remaining) on batch ${item.batchNumber.toUpperCase()}`,
        });
      }

      const freeQty = item.freeQuantity || 0;
      const totalAdd = item.acceptedQuantity + freeQty;
      let batchId: string | null = null;

      if (totalAdd > 0 && med) {
        batchId = `batch-grn-${Date.now().toString(36)}-${idx}`;
        const status: InventoryBatch['status'] = shortExpiryWarning
          ? 'near_expiry'
          : totalAdd <= med.minStockLevel
          ? 'low_stock'
          : 'normal';
        newBatches.push({
          id: batchId,
          medicineId: med.id,
          brandName: med.brandName,
          saltComposition: med.saltComposition,
          batchNumber: item.batchNumber.toUpperCase(),
          expiryDate: item.expiryDate,
          mfgDate: item.manufacturingDate || undefined,
          packSize: med.packSize,
          mrp: item.mrp,
          ptr: item.purchasePrice,
          sellingPrice: item.sellingPrice ?? item.mrp,
          currentStock: totalAdd,
          quantityReceived: totalAdd,
          freeQuantity: freeQty,
          supplierId: supplier.id,
          supplierName: supplier.agencyName,
          purchaseReferenceId: grnId,
          rackLocation: item.rackLocation || med.rackLocation,
          status,
          branchId: 'main',
          createdAt: now,
          updatedAt: now,
        });

        newMovements.push({
          id: `mov-grn-${Date.now().toString(36)}-${idx}`,
          tenantId: store.id,
          branchId: 'main',
          medicineId: med.id,
          batchId,
          batchNumber: item.batchNumber.toUpperCase(),
          medicineName: med.brandName,
          movementType: 'PURCHASE_RECEIPT',
          quantityChange: totalAdd,
          previousQuantity: 0,
          newQuantity: totalAdd,
          referenceType: 'goods_receipt',
          referenceId: grnId,
          reason: `GRN ${grnNumber} (${supplier.agencyName})`,
          performedBy: currentUser.name,
          timestamp: now,
        });
      }

      grnLines.push({
        id: `grni-${idx + 1}`,
        poItemId: item.poItemId || null,
        medicineId: item.medicineId,
        medicineName: med?.brandName || item.medicineId,
        genericName: med?.saltComposition || '',
        hsnCode: med?.hsnCode || '300490',
        batchNumber: item.batchNumber.toUpperCase(),
        manufacturingDate: item.manufacturingDate || null,
        expiryDate: item.expiryDate,
        receivedQuantity: item.acceptedQuantity + item.rejectedQuantity,
        acceptedQuantity: item.acceptedQuantity,
        rejectedQuantity: item.rejectedQuantity,
        freeQuantity: freeQty,
        rejectionReason: item.rejectionReason || null,
        purchasePrice: item.purchasePrice,
        mrp: item.mrp,
        sellingPrice: item.sellingPrice ?? item.mrp,
        discountPercent: discPct,
        discountAmount: discAmt,
        taxableAmount: lineTaxable,
        gstRate,
        cgst: lineCgst,
        sgst: lineSgst,
        igst: lineIgst,
        lineTotal,
        rackLocation: item.rackLocation || med?.rackLocation || null,
        inventoryBatchId: batchId,
        shortExpiryWarning,
        daysToExpiry: daysRemaining,
      });
    });

    const totalTax = Math.round((cgst + sgst + igst) * 100) / 100;
    const rawGrand = taxableAmount + totalTax;
    const grandTotal = Math.round(rawGrand);
    const roundOff = Math.round((grandTotal - rawGrand) * 100) / 100;

    let createdInvoice: SupplierInvoice | null = null;
    if (params.autoCreateInvoice && params.supplierInvoiceNumber?.trim()) {
      const invDate = params.supplierInvoiceDate || now;
      const dueD = new Date(invDate);
      dueD.setDate(dueD.getDate() + (supplier.creditPeriodDays ?? 21));
      createdInvoice = {
        id: `sinv-${Date.now().toString(36)}`,
        tenantId: store.id,
        branchId: 'main',
        supplierId: supplier.id,
        supplierCode: supplier.supplierCode || 'SUP',
        supplierName: supplier.agencyName,
        supplierGstin: supplier.gstin,
        grnId,
        grnNumber,
        poId: po?.id || null,
        poNumber: po?.poNumber || null,
        supplierInvoiceNumber: params.supplierInvoiceNumber.trim(),
        invoiceDate: invDate,
        dueDate: dueD.toISOString(),
        placeOfSupplyStateCode: supplier.stateCode || '27',
        isInterState,
        subtotal,
        totalDiscount,
        otherCharges: 0,
        taxableAmount,
        cgst,
        sgst,
        igst,
        totalTax,
        roundOff,
        totalAmount: grandTotal,
        amountPaid: 0,
        creditNoteAmount: 0,
        outstandingAmount: grandTotal,
        paymentStatus: 'UNPAID',
        recognitionBasis: 'GRN',
        createdAt: now,
      };
    }

    const grnRecord: GoodsReceiptNote = {
      id: grnId,
      grnNumber,
      tenantId: store.id,
      branchId: 'main',
      poId: po?.id || null,
      poNumber: po?.poNumber || null,
      supplierId: supplier.id,
      supplierCode: supplier.supplierCode || 'SUP',
      supplierName: supplier.agencyName,
      supplierGstin: supplier.gstin,
      supplierInvoiceNumber: params.supplierInvoiceNumber?.trim() || null,
      supplierInvoiceDate: params.supplierInvoiceDate || null,
      receiptDate: now,
      placeOfSupplyStateCode: supplier.stateCode || '27',
      isInterState,
      status: 'POSTED',
      items: grnLines,
      subtotal,
      totalDiscount,
      invoiceDiscount: 0,
      otherCharges: 0,
      taxableAmount,
      cgst,
      sgst,
      igst,
      totalTax,
      roundOff,
      grandTotal,
      totalReceivedQty: grnLines.reduce((s, l) => s + l.receivedQuantity, 0),
      totalAcceptedQty: grnLines.reduce((s, l) => s + l.acceptedQuantity, 0),
      totalRejectedQty: grnLines.reduce((s, l) => s + l.rejectedQuantity, 0),
      totalFreeQty: grnLines.reduce((s, l) => s + l.freeQuantity, 0),
      warnings,
      shortExpiryThresholdDays: warnDays,
      allowOverReceiptUsed: Boolean(params.allowOverReceipt),
      linkedInvoiceId: createdInvoice?.id || null,
      notes: params.notes || null,
      createdBy: currentUser.name,
      createdAt: now,
    };

    setInventory(prev => [...newBatches, ...prev]);
    setStockMovements(prev => [...newMovements, ...prev]);
    setGoodsReceipts(prev => [grnRecord, ...prev]);

    if (po) {
      setPurchaseOrders(prev =>
        prev.map(p => {
          if (p.id !== po.id) return p;
          const nextItems = p.items.map(line => {
            const addAcc = addByPoItem.get(line.id) || 0;
            const addRej = rejByPoItem.get(line.id) || 0;
            const nextRec = line.receivedQuantity + addAcc;
            return {
              ...line,
              receivedQuantity: nextRec,
              rejectedQuantity: line.rejectedQuantity + addRej,
              pendingQuantity: Math.max(0, line.orderedQuantity - nextRec),
            };
          });
          const totalReceivedQty = nextItems.reduce((s, l) => s + l.receivedQuantity, 0);
          const totalPendingQty = nextItems.reduce((s, l) => s + l.pendingQuantity, 0);
          return {
            ...p,
            items: nextItems,
            totalReceivedQty,
            totalPendingQty,
            status: totalPendingQty === 0 ? 'FULLY_RECEIVED' : totalReceivedQty > 0 ? 'PARTIALLY_RECEIVED' : p.status,
            updatedAt: now,
          };
        })
      );
    }

    if (createdInvoice) {
      setSupplierInvoices(prev => [createdInvoice!, ...prev]);
    }

    setSuppliers(prev =>
      prev.map(s =>
        s.id === supplier.id
          ? {
              ...s,
              totalPurchases: Math.round(((s.totalPurchases || 0) + grandTotal) * 100) / 100,
              outstandingBalance: createdInvoice
                ? Math.round(((s.outstandingBalance || 0) + createdInvoice.totalAmount) * 100) / 100
                : s.outstandingBalance,
              lastPurchaseDate: now,
            }
          : s
      )
    );

    return { ok: true, grn: grnRecord, invoice: createdInvoice };
  };

  const reverseGoodsReceipt = (grnId: string, reason: string): { ok: boolean; error?: string } => {
    const grn = goodsReceipts.find(g => g.id === grnId);
    if (!grn || grn.status === 'REVERSED') return { ok: false, error: 'GRN not found or already reversed.' };

    for (const line of grn.items) {
      if (!line.inventoryBatchId) continue;
      const b = inventory.find(x => x.id === line.inventoryBatchId);
      if (b && b.quantityReceived !== undefined && b.currentStock < b.quantityReceived) {
        return {
          ok: false,
          error: `Batch ${b.batchNumber} already had stock dispensed. Use Supplier Return instead.`,
        };
      }
    }

    if (grn.linkedInvoiceId) {
      const inv = supplierInvoices.find(i => i.id === grn.linkedInvoiceId);
      if (inv && inv.amountPaid > 0) {
        return { ok: false, error: 'Cannot reverse GRN after invoice payments have been recorded.' };
      }
    }

    const now = new Date().toISOString();
    const batchIds = new Set(grn.items.map(i => i.inventoryBatchId).filter(Boolean) as string[]);
    const revMovements: StockMovement[] = [];

    setInventory(prev =>
      prev.map(b => {
        if (!batchIds.has(b.id)) return b;
        revMovements.push({
          id: `mov-rev-${Date.now().toString(36)}-${b.id}`,
          tenantId: store.id,
          branchId: grn.branchId,
          medicineId: b.medicineId,
          batchId: b.id,
          batchNumber: b.batchNumber,
          medicineName: b.brandName,
          movementType: 'MANUAL_ADJUSTMENT',
          quantityChange: -b.currentStock,
          previousQuantity: b.currentStock,
          newQuantity: 0,
          referenceType: 'grn_reversal',
          referenceId: grn.id,
          reason: `GRN ${grn.grnNumber} reversed: ${reason}`,
          performedBy: currentUser.name,
          timestamp: now,
        });
        return { ...b, currentStock: 0, status: 'out_of_stock', updatedAt: now };
      })
    );
    setStockMovements(prev => [...revMovements, ...prev]);

    setGoodsReceipts(prev =>
      prev.map(g => (g.id === grnId ? { ...g, status: 'REVERSED', reversalReason: reason, reversedAt: now } : g))
    );

    if (grn.poId) {
      const revByPoLine = new Map<string, number>();
      grn.items.forEach(l => {
        if (l.poItemId) revByPoLine.set(l.poItemId, (revByPoLine.get(l.poItemId) || 0) + l.acceptedQuantity);
      });
      setPurchaseOrders(prev =>
        prev.map(po => {
          if (po.id !== grn.poId) return po;
          const nextItems = po.items.map(l => {
            const dec = revByPoLine.get(l.id) || 0;
            const nextRec = Math.max(0, l.receivedQuantity - dec);
            return { ...l, receivedQuantity: nextRec, pendingQuantity: Math.max(0, l.orderedQuantity - nextRec) };
          });
          const totalRec = nextItems.reduce((s, l) => s + l.receivedQuantity, 0);
          return {
            ...po,
            items: nextItems,
            totalReceivedQty: totalRec,
            totalPendingQty: nextItems.reduce((s, l) => s + l.pendingQuantity, 0),
            status: totalRec > 0 ? 'PARTIALLY_RECEIVED' : 'APPROVED',
            updatedAt: now,
          };
        })
      );
    }

    let invAmount = 0;
    if (grn.linkedInvoiceId) {
      const linked = supplierInvoices.find(i => i.id === grn.linkedInvoiceId);
      invAmount = linked?.totalAmount || 0;
      setSupplierInvoices(prev =>
        prev.map(i => (i.id === grn.linkedInvoiceId ? { ...i, outstandingAmount: 0, paymentStatus: 'REVERSED' } : i))
      );
    }

    setSuppliers(prev =>
      prev.map(s =>
        s.id === grn.supplierId
          ? {
              ...s,
              totalPurchases: Math.max(0, (s.totalPurchases || 0) - grn.grandTotal),
              outstandingBalance: Math.max(0, (s.outstandingBalance || 0) - invAmount),
            }
          : s
      )
    );

    return { ok: true };
  };

  const createSupplierInvoice = (params: {
    supplierId: string;
    grnId?: string | null;
    supplierInvoiceNumber: string;
    invoiceDate?: string;
    dueDate?: string;
    totalAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
    notes?: string;
  }): { ok: boolean; error?: string; invoice?: SupplierInvoice } => {
    const supplier = suppliers.find(s => s.id === params.supplierId);
    if (!supplier) return { ok: false, error: 'Supplier not found.' };

    const invNum = params.supplierInvoiceNumber.trim();
    if (!invNum) return { ok: false, error: 'Supplier invoice number is required.' };
    if (supplierInvoices.some(i => i.supplierId === supplier.id && i.paymentStatus !== 'REVERSED' && i.supplierInvoiceNumber.toLowerCase() === invNum.toLowerCase())) {
      return { ok: false, error: `Duplicate invoice number '${invNum}' for ${supplier.agencyName}.` };
    }

    const grn = params.grnId ? goodsReceipts.find(g => g.id === params.grnId) : undefined;
    if (grn) {
      if (grn.linkedInvoiceId || supplierInvoices.some(i => i.grnId === grn.id && i.paymentStatus !== 'REVERSED')) {
        return { ok: false, error: `Payable already recognized for GRN '${grn.grnNumber}'.` };
      }
    }

    const now = new Date().toISOString();
    const invDate = params.invoiceDate || grn?.receiptDate || now;
    const dueD = new Date(invDate);
    dueD.setDate(dueD.getDate() + (supplier.creditPeriodDays ?? 21));
    const total = grn ? grn.grandTotal : Math.round((params.totalAmount || 0) * 100) / 100;
    if (total <= 0) return { ok: false, error: 'Invoice total amount must be greater than zero.' };

    const invoice: SupplierInvoice = {
      id: `sinv-${Date.now().toString(36)}`,
      tenantId: store.id,
      branchId: 'main',
      supplierId: supplier.id,
      supplierCode: supplier.supplierCode || 'SUP',
      supplierName: supplier.agencyName,
      supplierGstin: supplier.gstin,
      grnId: grn?.id || null,
      grnNumber: grn?.grnNumber || null,
      poId: grn?.poId || null,
      poNumber: grn?.poNumber || null,
      supplierInvoiceNumber: invNum,
      invoiceDate: invDate,
      dueDate: params.dueDate || dueD.toISOString(),
      placeOfSupplyStateCode: supplier.stateCode || '27',
      isInterState: grn ? grn.isInterState : false,
      subtotal: grn ? grn.subtotal : total,
      totalDiscount: grn ? grn.totalDiscount : 0,
      otherCharges: grn ? grn.otherCharges : 0,
      taxableAmount: grn ? grn.taxableAmount : total,
      cgst: grn ? grn.cgst : params.cgst || 0,
      sgst: grn ? grn.sgst : params.sgst || 0,
      igst: grn ? grn.igst : params.igst || 0,
      totalTax: grn ? grn.totalTax : (params.cgst || 0) + (params.sgst || 0) + (params.igst || 0),
      roundOff: grn ? grn.roundOff : 0,
      totalAmount: total,
      amountPaid: 0,
      creditNoteAmount: 0,
      outstandingAmount: total,
      paymentStatus: 'UNPAID',
      recognitionBasis: grn ? 'GRN' : 'DIRECT_BILL',
      notes: params.notes || null,
      createdAt: now,
    };

    setSupplierInvoices(prev => [invoice, ...prev]);
    if (grn) {
      setGoodsReceipts(prev => prev.map(g => (g.id === grn.id ? { ...g, linkedInvoiceId: invoice.id } : g)));
    }
    setSuppliers(prev =>
      prev.map(s =>
        s.id === supplier.id
          ? { ...s, outstandingBalance: Math.round(((s.outstandingBalance || 0) + total) * 100) / 100 }
          : s
      )
    );
    return { ok: true, invoice };
  };

  const recordSupplierPayment = (params: {
    supplierId: string;
    paymentMode: SupplierPaymentMode;
    amount: number;
    referenceNumber?: string;
    notes?: string;
    allocations?: Array<{ invoiceId: string; amount: number }>;
    allowAdvance?: boolean;
  }): { ok: boolean; error?: string; payment?: SupplierPayment } => {
    const supplier = suppliers.find(s => s.id === params.supplierId);
    if (!supplier) return { ok: false, error: 'Supplier not found.' };
    if (params.amount <= 0) return { ok: false, error: 'Amount must be greater than zero.' };

    const openInvoices = supplierInvoices
      .filter(i => i.supplierId === supplier.id && i.paymentStatus !== 'REVERSED' && i.outstandingAmount > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    let remaining = Math.round(params.amount * 100) / 100;
    const allocations: SupplierPayment['allocations'] = [];
    const invoiceUpdates = new Map<string, { paid: number; out: number }>();

    if (params.allocations && params.allocations.length > 0) {
      for (const reqAlloc of params.allocations) {
        const inv = openInvoices.find(i => i.id === reqAlloc.invoiceId);
        if (!inv) return { ok: false, error: 'Allocated invoice not found or already paid.' };
        if (reqAlloc.amount > inv.outstandingAmount) {
          return { ok: false, error: `Allocation exceeds outstanding amount on ${inv.supplierInvoiceNumber}.` };
        }
        remaining = Math.round((remaining - reqAlloc.amount) * 100) / 100;
        invoiceUpdates.set(inv.id, {
          paid: Math.round((inv.amountPaid + reqAlloc.amount) * 100) / 100,
          out: Math.round((inv.outstandingAmount - reqAlloc.amount) * 100) / 100,
        });
        allocations.push({ invoiceId: inv.id, supplierInvoiceNumber: inv.supplierInvoiceNumber, allocatedAmount: reqAlloc.amount });
      }
    } else {
      for (const inv of openInvoices) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, inv.outstandingAmount);
        remaining = Math.round((remaining - take) * 100) / 100;
        invoiceUpdates.set(inv.id, {
          paid: Math.round((inv.amountPaid + take) * 100) / 100,
          out: Math.round((inv.outstandingAmount - take) * 100) / 100,
        });
        allocations.push({ invoiceId: inv.id, supplierInvoiceNumber: inv.supplierInvoiceNumber, allocatedAmount: take });
      }
    }

    const allocatedTotal = Math.round((params.amount - remaining) * 100) / 100;
    const settleOpening = Math.min(remaining, Math.max(0, (supplier.outstandingBalance || 0) - allocatedTotal));
    const advanceAdded = Math.round((remaining - settleOpening) * 100) / 100;

    if (advanceAdded > 0 && !params.allowAdvance) {
      return { ok: false, error: 'Payment exceeds outstanding balance. Enable advance payment to record excess.' };
    }

    const now = new Date().toISOString();
    const payment: SupplierPayment = {
      id: `spay-${Date.now().toString(36)}`,
      paymentNumber: `PAY-${new Date().getFullYear()}-${String(supplierPayments.length + 1).padStart(4, '0')}`,
      tenantId: store.id,
      branchId: 'main',
      supplierId: supplier.id,
      supplierCode: supplier.supplierCode || 'SUP',
      supplierName: supplier.agencyName,
      paymentDate: now,
      paymentMode: params.paymentMode,
      amount: params.amount,
      allocatedTotal,
      advanceAdded,
      referenceNumber: params.referenceNumber || null,
      notes: params.notes || null,
      allocations,
      createdBy: currentUser.name,
      createdAt: now,
    };

    setSupplierPayments(prev => [payment, ...prev]);
    setSupplierInvoices(prev =>
      prev.map(inv => {
        const upd = invoiceUpdates.get(inv.id);
        if (!upd) return inv;
        return {
          ...inv,
          amountPaid: upd.paid,
          outstandingAmount: upd.out,
          paymentStatus: upd.out === 0 ? 'PAID' : 'PARTIALLY_PAID',
        };
      })
    );
    setSuppliers(prev =>
      prev.map(s =>
        s.id === supplier.id
          ? {
              ...s,
              outstandingBalance: Math.max(0, Math.round(((s.outstandingBalance || 0) - allocatedTotal - settleOpening) * 100) / 100),
              advanceBalance: Math.round(((s.advanceBalance || 0) + advanceAdded) * 100) / 100,
              totalPayments: Math.round(((s.totalPayments || 0) + params.amount) * 100) / 100,
              lastPaymentDate: now,
            }
          : s
      )
    );
    return { ok: true, payment };
  };

  const createSupplierReturn = (params: {
    grnId: string;
    reason: string;
    items: Array<{ batchId: string; quantity: number; reason?: string }>;
  }): { ok: boolean; error?: string; supplierReturn?: SupplierReturn } => {
    const grn = goodsReceipts.find(g => g.id === params.grnId);
    if (!grn || grn.status !== 'POSTED') return { ok: false, error: 'Valid posted GRN is required.' };
    const supplier = suppliers.find(s => s.id === grn.supplierId);
    if (!supplier) return { ok: false, error: 'Supplier not found.' };

    const retItems: SupplierReturn['items'] = [];
    const batchDec = new Map<string, number>();

    for (const reqItem of params.items) {
      const grnLine = grn.items.find(l => l.inventoryBatchId === reqItem.batchId);
      const batch = inventory.find(b => b.id === reqItem.batchId);
      if (!grnLine || !batch) return { ok: false, error: 'Selected batch does not belong to this GRN.' };
      if (reqItem.quantity <= 0 || reqItem.quantity > batch.currentStock) {
        return { ok: false, error: `Insufficient batch stock for return on ${batch.batchNumber}.` };
      }
      const taxable = Math.round(reqItem.quantity * grnLine.purchasePrice * 100) / 100;
      const tax = Math.round((taxable * grnLine.gstRate) / 100 * 100) / 100;
      batchDec.set(batch.id, reqItem.quantity);
      retItems.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        medicineId: batch.medicineId,
        medicineName: batch.brandName,
        quantity: reqItem.quantity,
        unitCost: grnLine.purchasePrice,
        gstRate: grnLine.gstRate,
        taxableAmount: taxable,
        taxAmount: tax,
        lineTotal: Math.round((taxable + tax) * 100) / 100,
        reason: reqItem.reason || params.reason,
      });
    }

    const now = new Date().toISOString();
    const totalAmount = retItems.reduce((s, i) => Math.round((s + i.lineTotal) * 100) / 100, 0);
    const linkedInv = grn.linkedInvoiceId ? supplierInvoices.find(i => i.id === grn.linkedInvoiceId) : undefined;
    const payableReduced = linkedInv
      ? Math.min(totalAmount, linkedInv.outstandingAmount)
      : Math.min(totalAmount, supplier.outstandingBalance || 0);
    const advanceCredited = Math.round((totalAmount - payableReduced) * 100) / 100;
    const returnNumber = `PR-${new Date().getFullYear()}-${String(supplierReturns.length + 1).padStart(4, '0')}`;

    const retRecord: SupplierReturn = {
      id: `sret-${Date.now().toString(36)}`,
      returnNumber,
      tenantId: store.id,
      branchId: grn.branchId,
      supplierId: supplier.id,
      supplierCode: supplier.supplierCode || 'SUP',
      supplierName: supplier.agencyName,
      grnId: grn.id,
      grnNumber: grn.grnNumber,
      linkedInvoiceId: grn.linkedInvoiceId,
      creditNoteNumber: `CN-${returnNumber}`,
      returnDate: now,
      status: 'POSTED',
      items: retItems,
      subtotal: retItems.reduce((s, i) => Math.round((s + i.taxableAmount) * 100) / 100, 0),
      totalTax: retItems.reduce((s, i) => Math.round((s + i.taxAmount) * 100) / 100, 0),
      totalAmount,
      payableReduced,
      advanceCredited,
      reason: params.reason,
      createdBy: currentUser.name,
      createdAt: now,
    };

    const retMovs: StockMovement[] = [];
    setInventory(prev =>
      prev.map(b => {
        const dec = batchDec.get(b.id);
        if (!dec) return b;
        const nextStock = Math.max(0, b.currentStock - dec);
        retMovs.push({
          id: `mov-sret-${Date.now().toString(36)}-${b.id}`,
          tenantId: store.id,
          branchId: grn.branchId,
          medicineId: b.medicineId,
          batchId: b.id,
          batchNumber: b.batchNumber,
          medicineName: b.brandName,
          movementType: 'PURCHASE_RETURN',
          quantityChange: -dec,
          previousQuantity: b.currentStock,
          newQuantity: nextStock,
          referenceType: 'supplier_return',
          referenceId: retRecord.id,
          reason: `Supplier return (${supplier.agencyName}): ${params.reason}`,
          performedBy: currentUser.name,
          timestamp: now,
        });
        return { ...b, currentStock: nextStock, status: nextStock === 0 ? 'out_of_stock' : b.status, updatedAt: now };
      })
    );
    setStockMovements(prev => [...retMovs, ...prev]);
    setSupplierReturns(prev => [retRecord, ...prev]);

    if (linkedInv) {
      setSupplierInvoices(prev =>
        prev.map(i => {
          if (i.id !== linkedInv.id) return i;
          const nextOut = Math.max(0, Math.round((i.outstandingAmount - payableReduced) * 100) / 100);
          return {
            ...i,
            creditNoteAmount: Math.round((i.creditNoteAmount + totalAmount) * 100) / 100,
            outstandingAmount: nextOut,
            paymentStatus: nextOut === 0 ? 'PAID' : i.amountPaid > 0 ? 'PARTIALLY_PAID' : i.paymentStatus,
          };
        })
      );
    }

    setSuppliers(prev =>
      prev.map(s =>
        s.id === supplier.id
          ? {
              ...s,
              outstandingBalance: Math.max(0, Math.round(((s.outstandingBalance || 0) - payableReduced) * 100) / 100),
              advanceBalance: Math.round(((s.advanceBalance || 0) + advanceCredited) * 100) / 100,
            }
          : s
      )
    );
    return { ok: true, supplierReturn: retRecord };
  };

  const createBill = (billData: Omit<BillInvoice, 'id' | 'invoiceNumber' | 'timestamp' | 'cashierName'>) => {
    const invoiceSeq = (bills.length + 1049).toString();
    const invoiceNumber = `${store.invoicePrefix}-2026-${invoiceSeq}`;
    const now = new Date();
    const nowIso = now.toISOString();
    const formattedDate = `${nowIso.split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const khataPortion = Math.round(((billData.khataCreditAmount ?? (billData.paymentMode === 'khata_credit' ? billData.balanceDue : 0)) || 0) * 100) / 100;

    // Update customer metrics and Khata ledger entry when matched by ID or phone
    const matchedCustomer = billData.customerId
      ? customers.find(c => c.id === billData.customerId)
      : billData.customerPhone
      ? customers.find(c => c.phone === billData.customerPhone)
      : undefined;

    const prevOut = matchedCustomer?.khataBalance || 0;
    const prevAdv = matchedCustomer?.advanceBalance || 0;
    const advConsumed = matchedCustomer && khataPortion > 0 ? Math.min(prevAdv, khataPortion) : 0;
    const addedOut = Math.round((khataPortion - advConsumed) * 100) / 100;
    const nextOut = Math.round((prevOut + addedOut) * 100) / 100;
    const nextAdv = Math.round((prevAdv - advConsumed) * 100) / 100;

    const creditTermsDays = billData.creditTermsDays ?? matchedCustomer?.creditTermsDays ?? 15;
    let computedDueDate = billData.dueDate;
    if (!computedDueDate && addedOut > 0) {
      const due = new Date(now);
      due.setDate(due.getDate() + creditTermsDays);
      computedDueDate = due.toISOString().split('T')[0];
    }

    const effectiveAmountPaid = Math.round((billData.amountPaid + advConsumed) * 100) / 100;
    const effectiveBalanceDue = Math.max(0, Math.round((billData.grandTotal - effectiveAmountPaid) * 100) / 100);
    const effectivePaymentStatus =
      effectiveBalanceDue === 0 ? 'paid' : effectiveAmountPaid > 0 ? 'partial' : 'unpaid';

    const newBill: BillInvoice = {
      ...billData,
      id: `bill-${Date.now().toString(36)}`,
      invoiceNumber,
      timestamp: formattedDate,
      branchId: billData.branchId || activeBranchId || 'main',
      customerId: matchedCustomer?.id || billData.customerId,
      amountPaid: effectiveAmountPaid,
      balanceDue: effectiveBalanceDue,
      paymentStatus: effectivePaymentStatus,
      khataCreditAmount: khataPortion,
      creditTermsDays,
      dueDate: computedDueDate,
      cashierName: currentUser.name,
    };

    // Deduct inventory
    setInventory(prev =>
      prev.map(batch => {
        const cartItem = billData.items.find(item => item.batchId === batch.id);
        if (cartItem) {
          const updatedStock = Math.max(0, batch.currentStock - cartItem.quantity);
          const status = updatedStock <= 10 ? 'low_stock' : batch.status;
          return { ...batch, currentStock: updatedStock, status };
        }
        return batch;
      })
    );

    if (matchedCustomer) {
      setCustomers(prev =>
        prev.map(c =>
          c.id === matchedCustomer.id
            ? {
                ...c,
                totalVisits: c.totalVisits + 1,
                totalPurchased: Math.round((c.totalPurchased + billData.grandTotal) * 100) / 100,
                lastVisit: nowIso.split('T')[0],
                khataBalance: khataPortion > 0 ? nextOut : c.khataBalance,
                advanceBalance: khataPortion > 0 ? nextAdv : c.advanceBalance,
              }
            : c
        )
      );

      if (khataPortion > 0) {
        setCustomerLedgerEntries(prev => [
          {
            id: `led-${Date.now().toString(36)}`,
            tenantId: store.id,
            branchId: newBill.branchId || 'main',
            customerId: matchedCustomer.id,
            entryType: 'CREDIT_PURCHASE',
            direction: 'DEBIT',
            amount: khataPortion,
            appliedToBalance: addedOut,
            advanceDelta: -advConsumed,
            previousBalance: prevOut,
            runningBalance: nextOut,
            previousAdvanceBalance: prevAdv,
            runningAdvanceBalance: nextAdv,
            referenceType: 'sales_invoice',
            referenceId: newBill.id,
            invoiceId: newBill.id,
            invoiceNumber: newBill.invoiceNumber,
            description: `POS credit purchase (${newBill.invoiceNumber})`,
            reason: 'POS Khata checkout',
            performedBy: currentUser.id,
            performedByName: currentUser.name,
            timestamp: nowIso,
          },
          ...prev,
        ]);
      }
    }

    setBills(prev => [newBill, ...prev]);
    return newBill;
  };

  const cancelBill = (invoiceId: string, reason: string) => {
    const bill = bills.find(b => b.id === invoiceId);
    if (!bill || bill.status === 'cancelled') return;

    // Restore stock in inventory
    setInventory(prev =>
      prev.map(batch => {
        const item = bill.items.find(i => i.batchId === batch.id);
        if (item) {
          const restored = batch.currentStock + item.quantity;
          return { ...batch, currentStock: restored, status: restored <= 10 ? 'low_stock' : 'normal' };
        }
        return batch;
      })
    );

    // Append manual adjustment movements
    const now = new Date().toISOString();
    bill.items.forEach(item => {
      setStockMovements(prev => [
        {
          id: `mov-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
          tenantId: store.id,
          branchId: bill.branchId || activeBranchId || 'main',
          medicineId: item.medicineId,
          batchId: item.batchId,
          batchNumber: item.batchNumber,
          medicineName: item.brandName,
          movementType: 'MANUAL_ADJUSTMENT',
          quantityChange: item.quantity,
          previousQuantity: item.availableStock,
          newQuantity: item.availableStock + item.quantity,
          referenceType: 'sales_cancellation',
          referenceId: bill.id,
          reason: `Invoice Cancelled (${bill.invoiceNumber}): ${reason}`,
          performedBy: currentUser.name,
          timestamp: now,
        },
        ...prev,
      ]);
    });

    // Reverse open Khata credit due via deterministic CREDIT_NOTE
    const matchedCustomer = bill.customerId
      ? customers.find(c => c.id === bill.customerId)
      : undefined;
    const creditNoteAmount = Math.min(bill.balanceDue || 0, bill.khataCreditAmount || bill.balanceDue || 0);
    if (matchedCustomer && creditNoteAmount > 0) {
      const prevOut = matchedCustomer.khataBalance;
      const prevAdv = matchedCustomer.advanceBalance || 0;
      const appliedToBal = Math.min(prevOut, creditNoteAmount);
      const addedAdv = Math.round((creditNoteAmount - appliedToBal) * 100) / 100;
      const nextOut = Math.round((prevOut - appliedToBal) * 100) / 100;
      const nextAdv = Math.round((prevAdv + addedAdv) * 100) / 100;

      setCustomers(prev =>
        prev.map(c =>
          c.id === matchedCustomer.id
            ? { ...c, khataBalance: nextOut, advanceBalance: nextAdv }
            : c
        )
      );

      setCustomerLedgerEntries(prev => [
        {
          id: `led-${Date.now().toString(36)}-cn`,
          tenantId: store.id,
          branchId: bill.branchId || 'main',
          customerId: matchedCustomer.id,
          entryType: 'CREDIT_NOTE',
          direction: 'CREDIT',
          amount: creditNoteAmount,
          appliedToBalance: appliedToBal,
          advanceDelta: addedAdv,
          previousBalance: prevOut,
          runningBalance: nextOut,
          previousAdvanceBalance: prevAdv,
          runningAdvanceBalance: nextAdv,
          referenceType: 'invoice_cancellation',
          referenceId: bill.id,
          invoiceId: bill.id,
          invoiceNumber: bill.invoiceNumber,
          description: `Credit Note — Invoice ${bill.invoiceNumber} cancelled`,
          reason,
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          timestamp: now,
        },
        ...prev,
      ]);
    }

    setBills(prev =>
      prev.map(b =>
        b.id === invoiceId
          ? { ...b, status: 'cancelled', balanceDue: 0, notes: reason }
          : b
      )
    );
  };

  const processSalesReturn = (
    invoiceId: string,
    items: Array<{ batchId: string; quantity: number; reason: string; restock: boolean }>,
    reason: string
  ) => {
    const bill = bills.find(b => b.id === invoiceId);
    if (!bill || bill.status === 'cancelled') return;

    const now = new Date().toISOString();
    let totalRefund = 0;
    const processedItems: Array<{
      batchId: string;
      medicineId: string;
      medicineName: string;
      quantity: number;
      unitPrice: number;
      refundAmount: number;
      restocked: boolean;
    }> = [];

    items.forEach(ret => {
      const line = bill.items.find(i => i.batchId === ret.batchId);
      if (!line) return;
      const unitRefund = Math.round((line.mrp * (1 - line.discountPercent / 100)) * 100) / 100;
      const refund = Math.round(unitRefund * ret.quantity * 100) / 100;
      totalRefund = Math.round((totalRefund + refund) * 100) / 100;

      if (ret.restock) {
        setInventory(prev =>
          prev.map(batch =>
            batch.id === ret.batchId
              ? { ...batch, currentStock: batch.currentStock + ret.quantity }
              : batch
          )
        );

        setStockMovements(prev => [
          {
            id: `mov-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 5)}`,
            tenantId: store.id,
            branchId: bill.branchId || activeBranchId || 'main',
            medicineId: line.medicineId,
            batchId: line.batchId,
            batchNumber: line.batchNumber,
            medicineName: line.brandName,
            movementType: 'SALE_RETURN',
            quantityChange: ret.quantity,
            previousQuantity: line.availableStock,
            newQuantity: line.availableStock + ret.quantity,
            referenceType: 'sales_return',
            referenceId: bill.id,
            reason: `Sales Return on ${bill.invoiceNumber}: ${reason}`,
            performedBy: currentUser.name,
            timestamp: now,
          },
          ...prev,
        ]);
      }

      processedItems.push({
        batchId: line.batchId,
        medicineId: line.medicineId,
        medicineName: line.brandName,
        quantity: ret.quantity,
        unitPrice: line.mrp,
        refundAmount: refund,
        restocked: ret.restock,
      });
    });

    const newReturn: SalesReturn = {
      id: `ret-${Date.now().toString(36)}`,
      invoiceId,
      invoiceNumber: bill.invoiceNumber,
      items: processedItems,
      totalRefundAmount: totalRefund,
      reason,
      returnedBy: currentUser.name,
      timestamp: now,
    };

    const khataCreditReduction = Math.min(bill.balanceDue || 0, totalRefund);
    const matchedCustomer = bill.customerId
      ? customers.find(c => c.id === bill.customerId)
      : undefined;

    if (matchedCustomer && khataCreditReduction > 0) {
      const prevOut = matchedCustomer.khataBalance;
      const prevAdv = matchedCustomer.advanceBalance || 0;
      const appliedToBal = Math.min(prevOut, khataCreditReduction);
      const addedAdv = Math.round((khataCreditReduction - appliedToBal) * 100) / 100;
      const nextOut = Math.round((prevOut - appliedToBal) * 100) / 100;
      const nextAdv = Math.round((prevAdv + addedAdv) * 100) / 100;

      setCustomers(prev =>
        prev.map(c =>
          c.id === matchedCustomer.id
            ? { ...c, khataBalance: nextOut, advanceBalance: nextAdv }
            : c
        )
      );

      setCustomerLedgerEntries(prev => [
        {
          id: `led-${Date.now().toString(36)}-ret`,
          tenantId: store.id,
          branchId: bill.branchId || 'main',
          customerId: matchedCustomer.id,
          entryType: 'CREDIT_NOTE',
          direction: 'CREDIT',
          amount: khataCreditReduction,
          appliedToBalance: appliedToBal,
          advanceDelta: addedAdv,
          previousBalance: prevOut,
          runningBalance: nextOut,
          previousAdvanceBalance: prevAdv,
          runningAdvanceBalance: nextAdv,
          referenceType: 'sales_return',
          referenceId: newReturn.id,
          invoiceId: bill.id,
          invoiceNumber: bill.invoiceNumber,
          returnId: newReturn.id,
          description: `Credit Note — Sales Return on ${bill.invoiceNumber}`,
          reason,
          performedBy: currentUser.id,
          performedByName: currentUser.name,
          timestamp: now,
        },
        ...prev,
      ]);
    }

    setBills(prev =>
      prev.map(b =>
        b.id === invoiceId
          ? {
              ...b,
              balanceDue: Math.max(0, Math.round((b.balanceDue - khataCreditReduction) * 100) / 100),
              status: 'partially_returned',
              returns: [...(b.returns || []), newReturn],
            }
          : b
      )
    );
  };

  const recordBillPayment = (
    invoiceId: string,
    payment: { mode: PaymentMode; amount: number; referenceNumber?: string }
  ) => {
    const targetBill = bills.find(b => b.id === invoiceId);
    const nowIso = new Date().toISOString();

    if (targetBill && targetBill.customerId) {
      const matchedCustomer = customers.find(c => c.id === targetBill.customerId);
      if (matchedCustomer && payment.mode !== 'khata_credit') {
        const prevOut = matchedCustomer.khataBalance;
        const prevAdv = matchedCustomer.advanceBalance || 0;
        const appliedToBal = Math.min(prevOut, payment.amount);
        const addedAdv = Math.round((payment.amount - appliedToBal) * 100) / 100;
        const nextOut = Math.round((prevOut - appliedToBal) * 100) / 100;
        const nextAdv = Math.round((prevAdv + addedAdv) * 100) / 100;
        const entryTypeMap: Record<string, CustomerLedgerEntry['entryType']> = {
          cash: 'CASH_PAYMENT',
          upi: 'UPI_PAYMENT',
          card: 'CARD_PAYMENT',
          bank_transfer: 'BANK_TRANSFER',
        };
        const ledgerId = `led-${Date.now().toString(36)}`;
        const payId = `pay-${Date.now().toString(36)}`;
        const receiptNumber = `RCP-2026-${String(customerPayments.length + 101).padStart(4, '0')}`;

        setCustomers(prev =>
          prev.map(c =>
            c.id === matchedCustomer.id
              ? {
                  ...c,
                  khataBalance: nextOut,
                  advanceBalance: nextAdv,
                  totalPayments: Math.round(((c.totalPayments || 0) + payment.amount) * 100) / 100,
                  lastPaymentDate: nowIso.split('T')[0],
                }
              : c
          )
        );

        setCustomerLedgerEntries(prev => [
          {
            id: ledgerId,
            tenantId: store.id,
            branchId: targetBill.branchId || 'main',
            customerId: matchedCustomer.id,
            entryType: entryTypeMap[payment.mode] || 'CASH_PAYMENT',
            direction: 'CREDIT',
            amount: payment.amount,
            appliedToBalance: appliedToBal,
            advanceDelta: addedAdv,
            previousBalance: prevOut,
            runningBalance: nextOut,
            previousAdvanceBalance: prevAdv,
            runningAdvanceBalance: nextAdv,
            referenceType: 'khata_payment',
            referenceId: payId,
            invoiceId: targetBill.id,
            invoiceNumber: targetBill.invoiceNumber,
            paymentId: payId,
            paymentMode: payment.mode,
            referenceNumber: payment.referenceNumber || null,
            description: `Payment collected for ${targetBill.invoiceNumber} (${receiptNumber})`,
            performedBy: currentUser.id,
            performedByName: currentUser.name,
            timestamp: nowIso,
          },
          ...prev,
        ]);

        setCustomerPayments(prev => [
          {
            id: payId,
            receiptNumber,
            tenantId: store.id,
            branchId: targetBill.branchId || 'main',
            customerId: matchedCustomer.id,
            customerName: matchedCustomer.name,
            amount: payment.amount,
            appliedToBalance: appliedToBal,
            addedToAdvance: addedAdv,
            paymentMode: (payment.mode === 'bank_transfer' || payment.mode === 'upi' || payment.mode === 'card'
              ? payment.mode
              : 'cash'),
            referenceNumber: payment.referenceNumber || null,
            paymentDate: nowIso,
            allocations: [
              {
                invoiceId: targetBill.id,
                invoiceNumber: targetBill.invoiceNumber,
                allocatedAmount: appliedToBal,
                previousBalanceDue: targetBill.balanceDue,
                newBalanceDue: Math.max(0, Math.round((targetBill.balanceDue - appliedToBal) * 100) / 100),
              },
            ],
            recordedBy: currentUser.id,
            recordedByName: currentUser.name,
            ledgerEntryId: ledgerId,
            timestamp: nowIso,
          },
          ...prev,
        ]);
      }
    }

    setBills(prev =>
      prev.map(b => {
        if (b.id !== invoiceId) return b;
        const newPaid = Math.round((b.amountPaid + payment.amount) * 100) / 100;
        const newDue = Math.max(0, Math.round((b.grandTotal - newPaid) * 100) / 100);
        const newStatus = newDue === 0 ? 'paid' : 'partial';
        const newEntry: PaymentRecord = {
          id: `pay-${Date.now().toString(36)}`,
          mode: payment.mode,
          amount: payment.amount,
          referenceNumber: payment.referenceNumber,
          timestamp: nowIso,
        };
        return {
          ...b,
          amountPaid: newPaid,
          balanceDue: newDue,
          paymentStatus: newStatus,
          payments: [...(b.payments || []), newEntry],
        };
      })
    );
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  // Phase 4: Staff & RBAC Methods
  const inviteEmployee = (invite: {
    email: string;
    name: string;
    phone?: string;
    role: UserRole;
    assignedBranchIds: string[];
    permissionOverrides?: { granted?: string[]; revoked?: string[] };
  }): EmployeeInvitation => {
    const newInvite: EmployeeInvitation = {
      id: `inv-${Date.now().toString(36)}`,
      tenantId: store.id,
      email: invite.email.trim().toLowerCase(),
      name: invite.name.trim(),
      phone: invite.phone?.trim() || null,
      role: invite.role,
      assignedBranchIds: invite.assignedBranchIds.length > 0 ? invite.assignedBranchIds : ['main'],
      permissionOverrides: invite.permissionOverrides,
      token: `inv_token_${Math.random().toString(36).substring(2, 10)}`,
      status: 'pending',
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
    };
    setInvitationsList(prev => [newInvite, ...prev]);
    return newInvite;
  };

  const resendInvitation = (invitationId: string) => {
    setInvitationsList(prev =>
      prev.map(inv =>
        inv.id === invitationId
          ? {
              ...inv,
              token: `inv_token_${Math.random().toString(36).substring(2, 10)}`,
              expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
              status: 'pending' as const,
            }
          : inv
      )
    );
  };

  const cancelInvitation = (invitationId: string) => {
    setInvitationsList(prev =>
      prev.map(inv =>
        inv.id === invitationId ? { ...inv, status: 'cancelled' as const } : inv
      )
    );
  };

  const updateEmployeeRole = (userId: string, newRole: UserRole) => {
    setUsersList(prev =>
      prev.map(u => (u.id === userId ? { ...u, role: newRole } : u))
    );
    if (currentUser.id === userId) {
      setCurrentUser(prev => ({ ...prev, role: newRole }));
    }
  };

  const updateEmployeeBranches = (userId: string, branches: string[]) => {
    setUsersList(prev =>
      prev.map(u => (u.id === userId ? { ...u, assignedBranchIds: branches } : u))
    );
    if (currentUser.id === userId) {
      setCurrentUser(prev => ({ ...prev, assignedBranchIds: branches }));
    }
  };

  const updateEmployeePermissions = (
    userId: string,
    overrides: { granted?: string[]; revoked?: string[] }
  ) => {
    setUsersList(prev =>
      prev.map(u =>
        u.id === userId ? { ...u, permissionOverrides: overrides } : u
      )
    );
    if (currentUser.id === userId) {
      setCurrentUser(prev => ({ ...prev, permissionOverrides: overrides }));
    }
  };

  const updateEmployeeStatus = (
    userId: string,
    status: 'active' | 'suspended' | 'deactivated'
  ) => {
    setUsersList(prev =>
      prev.map(u => (u.id === userId ? { ...u, status } : u))
    );
    if (currentUser.id === userId) {
      setCurrentUser(prev => ({ ...prev, status }));
    }
  };

  const hasUserPermission = (permissionKey: string): boolean => {
    const normalized =
      permissionKey.trim().toLowerCase() === 'customers.credit_limit'
        ? 'customers.credit_limit_manage'
        : permissionKey.trim().toLowerCase();

    if (currentUser.role === 'owner') return true;
    const overrides = currentUser.permissionOverrides;
    if (overrides?.revoked?.includes(normalized)) return false;
    if (overrides?.granted?.includes(normalized)) return true;

    // Check role default permissions (mirrored from server/src/lib/permissions.ts)
    switch (currentUser.role) {
      case 'pharmacist':
        return [
          'dashboard.view',
          'billing.view',
          'billing.create',
          'billing.return',
          'billing.discount',
          'billing.schedule_h1',
          'medicines.view',
          'medicines.create',
          'medicines.edit',
          'inventory.view',
          'inventory.write',
          'inventory.adjust',
          'inventory.ptr_margin',
          'inventory.transfer',
          'inventory.dispose',
          'customers.view',
          'customers.create',
          'customers.update',
          'customers.view_phone',
          'customers.view_purchase_history',
          'customers.khata_view',
          'customers.khata_collect',
          'customers.khata_settle',
          'customers.statement_view',
          'customers.statement_export',
          'customers.statement_share',
          'customers.reports_view',
          'suppliers.view',
          'suppliers.create',
          'suppliers.update',
          'purchase_orders.view',
          'purchase_orders.create',
          'purchase_orders.update',
          'purchase_orders.submit',
          'goods_receipts.view',
          'goods_receipts.create',
          'goods_receipts.post',
          'supplier_invoices.view',
          'supplier_returns.create',
          'supplier_reports.view',
          'suppliers.manage',
          'purchases.manage',
          'reports.view',
          'accounting.expenses.view',
          'accounting.expenses.create',
          'branches.view',
          'stock_transfers.view',
          'stock_transfers.create',
          'stock_transfers.update',
          'stock_transfers.submit',
          'stock_transfers.approve',
          'stock_transfers.reject',
          'stock_transfers.dispatch',
          'stock_transfers.receive',
          'stock_transfers.cancel',
          'stock_transfers.view_valuation',
          'reports.branch.view',
        ].includes(normalized);
      case 'cashier':
        return [
          'dashboard.view',
          'billing.view',
          'billing.create',
          'medicines.view',
          'inventory.view',
          'customers.view',
          'customers.create',
          'customers.view_phone',
          'customers.view_purchase_history',
          'customers.khata_view',
          'customers.khata_collect',
          'customers.khata_settle',
          'customers.statement_view',
          'reports.view',
          'branches.view',
          'stock_transfers.view',
          'stock_transfers.receive',
          'reports.branch.view',
        ].includes(normalized);
      case 'helper':
        return ['medicines.view', 'inventory.view'].includes(normalized);
      case 'auditor':
        return [
          'dashboard.view',
          'medicines.view',
          'inventory.view',
          'inventory.ptr_margin',
          'customers.view',
          'customers.view_purchase_history',
          'customers.khata_view',
          'customers.statement_view',
          'customers.statement_export',
          'customers.reports_view',
          'suppliers.view',
          'suppliers.view_financials',
          'suppliers.export',
          'purchase_orders.view',
          'goods_receipts.view',
          'goods_receipts.export',
          'supplier_invoices.view',
          'supplier_payments.view',
          'supplier_reports.view',
          'reports.view',
          'reports.financial',
          'reports.gst',
          'audit.view',
          'accounting.view',
          'accounting.accounts.view',
          'accounting.journals.view',
          'accounting.reports.view',
          'accounting.reports.export',
          'accounting.expenses.view',
          'accounting.cash_bank.view',
          'accounting.periods.view',
          'accounting.audit.view',
          'branches.view',
          'branches.view_financials',
          'stock_transfers.view',
          'stock_transfers.view_valuation',
          'reports.branch.view',
          'reports.branch.export',
          'reports.consolidated.view',
          'reports.consolidated.export',
        ].includes(normalized);
      default:
        return false;
    }
  };

  // ==================== PHASE 10: BRANCHES & INTER-BRANCH TRANSFERS ====================

  const appendBranchAudit = (entry: Omit<BranchAuditLogEntry, 'id' | 'tenantId' | 'performedBy' | 'timestamp'>) => {
    setBranchAuditLogs(prev => [
      {
        ...entry,
        id: `baud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
        tenantId: store.id,
        performedBy: currentUser.name,
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const createBranch: PharmacyContextType['createBranch'] = async payload => {
    if (apiSession.bearerToken) {
      try {
        const created = await branchTransferApi.createBranch(apiSession, payload);
        await refreshMultiBranchData();
        return { ok: true, branch: created };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to create branch' };
      }
    }

    const code = payload.branchCode.trim().toUpperCase();
    if (branches.some(b => b.branchCode.toUpperCase() === code)) {
      return { ok: false, error: `Branch code '${code}' already exists.` };
    }
    const now = new Date().toISOString();
    const id = `br_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now().toString(36).slice(-4)}`;
    const newBranch: PharmacyBranch = {
      id,
      tenantId: store.id,
      branchCode: code,
      name: payload.name.trim(),
      branchType: payload.branchType || 'RETAIL',
      isMain: false,
      isPrimary: Boolean(payload.isPrimary),
      status: 'ACTIVE',
      address: payload.address.trim(),
      city: payload.city || store.city,
      state: payload.state || store.state,
      pincode: payload.pincode || store.pincode,
      phone: payload.phone || store.phone,
      email: payload.email || store.email,
      gstin: payload.gstin ?? store.gstin,
      dlNumber20B: payload.dlNumber20B ?? null,
      dlNumber21B: payload.dlNumber21B ?? null,
      managerUserId: payload.managerUserId ?? null,
      managerName: payload.managerName ?? null,
      operatingHours: payload.operatingHours ?? '09:00 AM - 09:30 PM',
      timezone: 'Asia/Kolkata',
      transferPolicy: {
        requireApproval: payload.transferPolicy?.requireApproval ?? true,
        allowSelfApproval: payload.transferPolicy?.allowSelfApproval ?? false,
        approvalThresholdAmount: payload.transferPolicy?.approvalThresholdAmount ?? 5000,
        approvalThresholdQty: payload.transferPolicy?.approvalThresholdQty ?? 25,
        defaultPriceBasis: payload.transferPolicy?.defaultPriceBasis ?? 'PTR',
      },
      createdAt: now,
      updatedAt: now,
    };

    setBranches(prev => [
      ...prev.map(b => (newBranch.isPrimary ? { ...b, isPrimary: false } : b)),
      newBranch,
    ]);
    appendBranchAudit({
      branchId: newBranch.id,
      branchCode: newBranch.branchCode,
      branchName: newBranch.name,
      action: 'BRANCH_CREATED',
      newStatus: 'ACTIVE',
    });
    return { ok: true, branch: newBranch };
  };

  const updateBranch: PharmacyContextType['updateBranch'] = async (branchId, updated) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.updateBranch(apiSession, branchId, updated);
        await refreshMultiBranchData();
        return { ok: true, branch: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to update branch' };
      }
    }

    const existing = branches.find(b => b.id === branchId);
    if (!existing) return { ok: false, error: 'Branch not found' };
    if (existing.status === 'CLOSED') return { ok: false, error: 'Closed branches are permanently read-only.' };
    if (updated.branchCode) {
      const code = updated.branchCode.trim().toUpperCase();
      if (branches.some(b => b.id !== branchId && b.branchCode.toUpperCase() === code)) {
        return { ok: false, error: `Branch code '${code}' already exists.` };
      }
    }

    const merged: PharmacyBranch = {
      ...existing,
      ...updated,
      branchCode: updated.branchCode ? updated.branchCode.trim().toUpperCase() : existing.branchCode,
      updatedAt: new Date().toISOString(),
    };
    setBranches(prev => prev.map(b => (b.id === branchId ? merged : b)));
    if (activeBranchId === branchId && updated.name) {
      setStore(prev => ({ ...prev, branchName: updated.name! }));
    }
    return { ok: true, branch: merged };
  };

  const updateBranchSettings: PharmacyContextType['updateBranchSettings'] = async (branchId, settings) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.updateBranchSettings(apiSession, branchId, settings);
        await refreshMultiBranchData();
        return { ok: true, branch: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to update settings' };
      }
    }

    const existing = branches.find(b => b.id === branchId);
    if (!existing) return { ok: false, error: 'Branch not found' };
    if (existing.status === 'CLOSED') return { ok: false, error: 'Closed branches cannot modify settings.' };
    const merged: PharmacyBranch = {
      ...existing,
      operatingHours: settings.operatingHours ?? existing.operatingHours,
      timezone: settings.timezone ?? existing.timezone,
      transferPolicy: {
        ...existing.transferPolicy,
        requireApproval: settings.requireApproval ?? existing.transferPolicy.requireApproval,
        allowSelfApproval: settings.allowSelfApproval ?? existing.transferPolicy.allowSelfApproval,
        approvalThresholdAmount: settings.approvalThresholdAmount ?? existing.transferPolicy.approvalThresholdAmount,
        approvalThresholdQty: settings.approvalThresholdQty ?? existing.transferPolicy.approvalThresholdQty,
        defaultPriceBasis: settings.defaultPriceBasis ?? existing.transferPolicy.defaultPriceBasis,
      },
      updatedAt: new Date().toISOString(),
    };
    setBranches(prev => prev.map(b => (b.id === branchId ? merged : b)));
    appendBranchAudit({
      branchId: merged.id,
      branchCode: merged.branchCode,
      branchName: merged.name,
      action: 'SETTINGS_UPDATED',
    });
    return { ok: true, branch: merged };
  };

  const setPrimaryBranch: PharmacyContextType['setPrimaryBranch'] = async branchId => {
    if (apiSession.bearerToken) {
      try {
        await branchTransferApi.setPrimaryBranch(apiSession, branchId);
        await refreshMultiBranchData();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to promote primary branch' };
      }
    }

    const target = branches.find(b => b.id === branchId);
    if (!target) return { ok: false, error: 'Branch not found' };
    if (target.status !== 'ACTIVE') return { ok: false, error: 'Only ACTIVE branches can be promoted to primary.' };
    setBranches(prev =>
      prev.map(b => ({
        ...b,
        isPrimary: b.id === branchId,
        updatedAt: new Date().toISOString(),
      }))
    );
    appendBranchAudit({
      branchId: target.id,
      branchCode: target.branchCode,
      branchName: target.name,
      action: 'PRIMARY_BRANCH_CHANGED',
    });
    return { ok: true };
  };

  const changeBranchStatus: PharmacyContextType['changeBranchStatus'] = async (branchId, status, reason) => {
    if (apiSession.bearerToken) {
      try {
        const action = status === 'ACTIVE' ? 'activate' : status === 'SUSPENDED' ? 'suspend' : 'deactivate';
        await branchTransferApi.changeBranchStatus(apiSession, branchId, action, reason);
        await refreshMultiBranchData();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Status update failed' };
      }
    }

    const target = branches.find(b => b.id === branchId);
    if (!target) return { ok: false, error: 'Branch not found' };
    if (target.status === 'CLOSED') return { ok: false, error: 'Closed branches cannot be reopened or modified.' };
    if (status !== 'ACTIVE') {
      if (target.isPrimary) return { ok: false, error: 'Promote another ACTIVE branch to primary before suspending or deactivating this branch.' };
      const otherActive = branches.filter(b => b.id !== branchId && b.status === 'ACTIVE');
      if (otherActive.length === 0) return { ok: false, error: 'Cannot deactivate the sole active operational branch.' };
    }

    setBranches(prev =>
      prev.map(b => (b.id === branchId ? { ...b, status, updatedAt: new Date().toISOString() } : b))
    );
    appendBranchAudit({
      branchId: target.id,
      branchCode: target.branchCode,
      branchName: target.name,
      action: `STATUS_${status}`,
      previousStatus: target.status,
      newStatus: status,
      reason: reason || null,
    });
    return { ok: true };
  };

  const checkBranchClosure: PharmacyContextType['checkBranchClosure'] = async branchId => {
    if (apiSession.bearerToken) {
      return branchTransferApi.checkBranchClosure(apiSession, branchId);
    }

    const target = branches.find(b => b.id === branchId) || branches[0];
    const activeBranchCount = branches.filter(b => b.status === 'ACTIVE').length;
    const pendingStockTransfers = stockTransfers.filter(
      t =>
        (t.sourceBranchId === branchId || t.destinationBranchId === branchId) &&
        !['RECEIVED', 'CANCELLED', 'REJECTED', 'CLOSED'].includes(t.status)
    ).length;
    const openPurchaseOrders = purchaseOrders.filter(
      p => p.branchId === branchId && ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(p.status)
    ).length;
    const draftGrns = goodsReceipts.filter(g => g.branchId === branchId && g.status === 'DRAFT').length;
    const unsettledExpenses = previewExpenses.filter(
      e => e.branchId === branchId && ['DRAFT', 'SUBMITTED', 'APPROVED_UNPAID'].includes(e.status)
    ).length;
    const openSalesInvoicesReceivable = allBills.filter(
      b => (b.branchId || 'main') === branchId && b.status !== 'cancelled' && b.balanceDue > 0
    ).length;
    const openSupplierInvoicesPayable = supplierInvoices.filter(
      i => i.branchId === branchId && i.paymentStatus !== 'REVERSED' && i.outstandingAmount > 0
    ).length;
    const branchBatches = allInventory.filter(b => (b.branchId || 'main') === branchId && b.currentStock > 0);
    const remainingStockUnits = branchBatches.reduce((s, b) => s + b.currentStock, 0);
    const remainingStockPtrValue = Math.round(
      branchBatches.reduce((s, b) => s + b.currentStock * (b.ptr || 0), 0) * 100
    ) / 100;

    const blockers: string[] = [];
    if (target.isPrimary) blockers.push('Branch is currently marked Primary. Promote another active branch first.');
    if (activeBranchCount <= 1 && target.status === 'ACTIVE') blockers.push('Cannot close the sole active operational branch.');
    if (pendingStockTransfers > 0) blockers.push(`${pendingStockTransfers} active or in-transit stock transfer(s) involve this branch.`);
    if (openPurchaseOrders > 0) blockers.push(`${openPurchaseOrders} open purchase order(s) remain unclosed.`);
    if (draftGrns > 0) blockers.push(`${draftGrns} draft GRN(s) are pending.`);
    if (unsettledExpenses > 0) blockers.push(`${unsettledExpenses} unsettled operating expense(s) exist.`);
    if (openSalesInvoicesReceivable > 0) blockers.push(`${openSalesInvoicesReceivable} unpaid customer Khata invoice(s) exist.`);
    if (openSupplierInvoicesPayable > 0) blockers.push(`${openSupplierInvoicesPayable} unpaid supplier bill(s) exist.`);
    if (remainingStockUnits > 0) {
      blockers.push(`${remainingStockUnits} saleable units (₹${remainingStockPtrValue.toFixed(2)} PTR) remain on hand. Transfer out or dispose first.`);
    }

    return {
      branchId: target.id,
      branchCode: target.branchCode,
      branchName: target.name,
      eligible: blockers.length === 0,
      blockers,
      metrics: {
        isPrimary: target.isPrimary,
        activeBranchCount,
        pendingStockTransfers,
        openPurchaseOrders,
        draftGrns,
        unsettledExpenses,
        openSalesInvoicesReceivable,
        openSupplierInvoicesPayable,
        remainingStockUnits,
        remainingStockPtrValue,
      },
    };
  };

  const closeBranch: PharmacyContextType['closeBranch'] = async (branchId, closureNotes) => {
    if (apiSession.bearerToken) {
      try {
        await branchTransferApi.closeBranch(apiSession, branchId, closureNotes);
        await refreshMultiBranchData();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Branch closure failed' };
      }
    }

    const check = await checkBranchClosure(branchId);
    if (!check.eligible) {
      return { ok: false, error: check.blockers[0] || 'Branch is not eligible for closure.' };
    }
    const target = branches.find(b => b.id === branchId);
    if (!target) return { ok: false, error: 'Branch not found' };
    const now = new Date().toISOString();
    setBranches(prev =>
      prev.map(b =>
        b.id === branchId
          ? {
              ...b,
              status: 'CLOSED',
              closedAt: now,
              closedBy: currentUser.id,
              closureNotes: closureNotes || null,
              updatedAt: now,
            }
          : b
      )
    );
    appendBranchAudit({
      branchId: target.id,
      branchCode: target.branchCode,
      branchName: target.name,
      action: 'BRANCH_CLOSED',
      previousStatus: target.status,
      newStatus: 'CLOSED',
      reason: closureNotes || null,
    });
    return { ok: true };
  };

  const assignEmployeeToBranch: PharmacyContextType['assignEmployeeToBranch'] = async (branchId, userId) => {
    if (apiSession.bearerToken) {
      try {
        await branchTransferApi.assignEmployeeToBranch(apiSession, branchId, userId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to assign employee' };
      }
    }

    const user = usersList.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'Staff member not found' };
    const nextBranches = Array.from(new Set([...(user.assignedBranchIds || ['main']), branchId]));
    updateEmployeeBranches(userId, nextBranches);
    return { ok: true };
  };

  const removeEmployeeFromBranch: PharmacyContextType['removeEmployeeFromBranch'] = async (branchId, userId) => {
    if (apiSession.bearerToken) {
      try {
        await branchTransferApi.removeEmployeeFromBranch(apiSession, branchId, userId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to unassign employee' };
      }
    }

    const user = usersList.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'Staff member not found' };
    const remaining = (user.assignedBranchIds || ['main']).filter(id => id !== branchId && id !== '*');
    if (user.role !== 'owner' && remaining.length === 0) {
      return { ok: false, error: 'Non-owner staff must retain at least one assigned branch.' };
    }
    updateEmployeeBranches(userId, remaining);
    return { ok: true };
  };

  const createStockTransfer: PharmacyContextType['createStockTransfer'] = async payload => {
    if (apiSession.bearerToken) {
      try {
        const transfer = await branchTransferApi.createStockTransfer(apiSession, payload);
        await refreshMultiBranchData();
        return { ok: true, transfer };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to create stock transfer' };
      }
    }

    if (payload.sourceBranchId === payload.destinationBranchId) {
      return { ok: false, error: 'Source and destination branches must be different.' };
    }
    const sourceBranch = branches.find(b => b.id === payload.sourceBranchId);
    const destBranch = branches.find(b => b.id === payload.destinationBranchId);
    if (!sourceBranch || !destBranch) {
      return { ok: false, error: 'Invalid source or destination branch.' };
    }
    if (sourceBranch.status !== 'ACTIVE') {
      return { ok: false, error: `Source branch '${sourceBranch.name}' is ${sourceBranch.status}.` };
    }
    if (destBranch.status !== 'ACTIVE') {
      return { ok: false, error: `Destination branch '${destBranch.name}' is ${destBranch.status}.` };
    }

    const now = new Date().toISOString();
    const transferId = `trf-${Date.now().toString(36)}`;
    const transferNumber = `TRF-${new Date().getFullYear()}-${String(stockTransfers.length + 1).padStart(4, '0')}`;
    const builtItems: StockTransfer['items'] = [];

    for (let i = 0; i < payload.items.length; i += 1) {
      const line = payload.items[i];
      const batch = allInventory.find(b => b.id === line.sourceBatchId && (b.branchId || 'main') === sourceBranch.id);
      if (!batch) {
        return { ok: false, error: `Batch not found in source branch '${sourceBranch.branchCode}'.` };
      }
      if (batch.status === 'expired') {
        return { ok: false, error: `Expired batch '${batch.batchNumber}' cannot be transferred.` };
      }
      if (line.requestedQuantity <= 0 || line.requestedQuantity > batch.currentStock) {
        return {
          ok: false,
          error: `Requested qty (${line.requestedQuantity}) exceeds available stock (${batch.currentStock}) on ${batch.brandName} (${batch.batchNumber}).`,
        };
      }
      const med = medicines.find(m => m.id === batch.medicineId);
      builtItems.push({
        id: `${transferId}-item-${i + 1}`,
        transferId,
        medicineId: batch.medicineId,
        medicineName: batch.brandName,
        saltComposition: batch.saltComposition,
        sourceBatchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        packSize: batch.packSize,
        requestedQuantity: line.requestedQuantity,
        approvedQuantity: 0,
        dispatchedQuantity: 0,
        receivedQuantity: 0,
        damagedQuantity: 0,
        missingQuantity: 0,
        unitCostPtr: batch.ptr,
        mrp: batch.mrp,
        sellingPrice: batch.sellingPrice || batch.mrp,
        gstSlab: med?.gstSlab ?? 12,
      });
    }

    const totalRequestedQty = builtItems.reduce((s, i) => s + i.requestedQuantity, 0);
    const totalValuationPtr = Math.round(
      builtItems.reduce((s, i) => s + i.requestedQuantity * i.unitCostPtr, 0) * 100
    ) / 100;

    let status: StockTransfer['status'] = 'DRAFT';
    if (payload.submitImmediately) {
      const needsApproval =
        sourceBranch.transferPolicy.requireApproval &&
        (totalValuationPtr >= sourceBranch.transferPolicy.approvalThresholdAmount ||
          totalRequestedQty >= sourceBranch.transferPolicy.approvalThresholdQty ||
          sourceBranch.transferPolicy.approvalThresholdAmount === 0);
      status = needsApproval ? 'PENDING_APPROVAL' : 'APPROVED';
      if (status === 'APPROVED') {
        builtItems.forEach(item => {
          item.approvedQuantity = item.requestedQuantity;
        });
      }
    }

    const created: StockTransfer = {
      id: transferId,
      transferNumber,
      tenantId: store.id,
      sourceBranchId: sourceBranch.id,
      sourceBranchCode: sourceBranch.branchCode,
      sourceBranchName: sourceBranch.name,
      destinationBranchId: destBranch.id,
      destinationBranchCode: destBranch.branchCode,
      destinationBranchName: destBranch.name,
      status,
      transferDate: payload.transferDate || now.slice(0, 10),
      expectedDeliveryDate: payload.expectedDeliveryDate || null,
      notes: payload.notes || null,
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      approvedBy: status === 'APPROVED' ? 'AUTO_POLICY' : null,
      totalRequestedQty,
      totalDispatchedQty: 0,
      totalReceivedQty: 0,
      totalDamagedQty: 0,
      totalMissingQty: 0,
      totalValuationPtr,
      inTransitValuationPtr: 0,
      hasDiscrepancies: false,
      items: builtItems,
      createdAt: now,
      updatedAt: now,
    };

    setStockTransfers(prev => [created, ...prev]);
    return { ok: true, transfer: created };
  };

  const submitStockTransfer: PharmacyContextType['submitStockTransfer'] = async transferId => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.submitStockTransfer(apiSession, transferId);
        await refreshMultiBranchData();
        return { ok: true, transfer: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Submit failed' };
      }
    }
    const target = stockTransfers.find(t => t.id === transferId);
    if (!target || target.status !== 'DRAFT') return { ok: false, error: 'Only DRAFT transfers can be submitted.' };
    const updated: StockTransfer = { ...target, status: 'PENDING_APPROVAL', updatedAt: new Date().toISOString() };
    setStockTransfers(prev => prev.map(t => (t.id === transferId ? updated : t)));
    return { ok: true, transfer: updated };
  };

  const approveStockTransfer: PharmacyContextType['approveStockTransfer'] = async (transferId, itemsOverride) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.approveStockTransfer(apiSession, transferId, itemsOverride);
        await refreshMultiBranchData();
        return { ok: true, transfer: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Approval failed' };
      }
    }
    const target = stockTransfers.find(t => t.id === transferId);
    if (!target) return { ok: false, error: 'Transfer not found.' };
    const sourceBranch = branches.find(b => b.id === target.sourceBranchId);
    if (
      sourceBranch &&
      !sourceBranch.transferPolicy.allowSelfApproval &&
      target.requestedBy === currentUser.id &&
      currentUser.role !== 'owner'
    ) {
      return { ok: false, error: 'Self-approval is disabled by branch transfer policy.' };
    }
    const nextItems = target.items.map(i => {
      const ov = itemsOverride?.find(o => o.itemId === i.id);
      return { ...i, approvedQuantity: ov ? ov.approvedQuantity : i.requestedQuantity };
    });
    const updated: StockTransfer = {
      ...target,
      status: 'APPROVED',
      approvedBy: currentUser.id,
      items: nextItems,
      updatedAt: new Date().toISOString(),
    };
    setStockTransfers(prev => prev.map(t => (t.id === transferId ? updated : t)));
    return { ok: true, transfer: updated };
  };

  const rejectStockTransfer: PharmacyContextType['rejectStockTransfer'] = async (transferId, reason) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.rejectStockTransfer(apiSession, transferId, reason);
        await refreshMultiBranchData();
        return { ok: true, transfer: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Rejection failed' };
      }
    }
    const target = stockTransfers.find(t => t.id === transferId);
    if (!target) return { ok: false, error: 'Transfer not found.' };
    const updated: StockTransfer = {
      ...target,
      status: 'REJECTED',
      rejectionReason: reason,
      updatedAt: new Date().toISOString(),
    };
    setStockTransfers(prev => prev.map(t => (t.id === transferId ? updated : t)));
    return { ok: true, transfer: updated };
  };

  const cancelStockTransfer: PharmacyContextType['cancelStockTransfer'] = async (transferId, reason) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.cancelStockTransfer(apiSession, transferId, reason);
        await refreshMultiBranchData();
        return { ok: true, transfer: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Cancellation failed' };
      }
    }
    const target = stockTransfers.find(t => t.id === transferId);
    if (!target) return { ok: false, error: 'Transfer not found.' };
    if (target.totalDispatchedQty > 0) {
      return { ok: false, error: 'Dispatched transfers cannot be cancelled; receive and reconcile instead.' };
    }
    const updated: StockTransfer = {
      ...target,
      status: 'CANCELLED',
      cancellationReason: reason,
      updatedAt: new Date().toISOString(),
    };
    setStockTransfers(prev => prev.map(t => (t.id === transferId ? updated : t)));
    return { ok: true, transfer: updated };
  };

  const dispatchStockTransfer: PharmacyContextType['dispatchStockTransfer'] = async (transferId, payload) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.dispatchStockTransfer(apiSession, transferId, payload);
        await refreshMultiBranchData();
        return { ok: true, transfer: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Dispatch failed' };
      }
    }

    const target = stockTransfers.find(t => t.id === transferId);
    if (!target) return { ok: false, error: 'Transfer not found.' };
    if (!['APPROVED', 'DISPATCHED', 'IN_TRANSIT'].includes(target.status)) {
      return { ok: false, error: `Transfer in status '${target.status}' cannot be dispatched.` };
    }

    const now = new Date().toISOString();
    const qtyByItem = new Map<string, number>();
    for (const item of target.items) {
      const ov = payload.items?.find(x => x.itemId === item.id);
      const maxRemaining = (item.approvedQuantity || item.requestedQuantity) - item.dispatchedQuantity;
      const qty = ov ? ov.dispatchQuantity : maxRemaining;
      if (qty <= 0) continue;
      if (qty > maxRemaining) {
        return { ok: false, error: `Dispatch qty (${qty}) exceeds remaining approved qty (${maxRemaining}) for ${item.medicineName}.` };
      }
      const batch = allInventory.find(b => b.id === item.sourceBatchId);
      if (!batch || batch.currentStock < qty) {
        return { ok: false, error: `Insufficient stock in source batch '${item.batchNumber}' (${batch?.currentStock ?? 0} available).` };
      }
      qtyByItem.set(item.id, qty);
    }

    if (qtyByItem.size === 0) return { ok: false, error: 'No dispatchable quantities specified.' };

    const newMovements: StockMovement[] = [];
    setAllInventory(prev =>
      prev.map(batch => {
        let delta = 0;
        for (const item of target.items) {
          if (item.sourceBatchId === batch.id && qtyByItem.has(item.id)) {
            const q = qtyByItem.get(item.id)!;
            delta += q;
            newMovements.push({
              id: `mov-trfout-${Date.now().toString(36)}-${item.id.slice(-4)}`,
              tenantId: store.id,
              branchId: target.sourceBranchId,
              medicineId: batch.medicineId,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              medicineName: batch.brandName,
              movementType: 'STOCK_TRANSFER_OUT',
              quantityChange: -q,
              previousQuantity: batch.currentStock,
              newQuantity: Math.max(0, batch.currentStock - q),
              referenceType: 'stock_transfer',
              referenceId: target.id,
              reason: `Dispatched to ${target.destinationBranchName} (${target.transferNumber})`,
              performedBy: currentUser.name,
              timestamp: now,
            });
          }
        }
        if (delta === 0) return batch;
        const nextStock = Math.max(0, batch.currentStock - delta);
        return {
          ...batch,
          currentStock: nextStock,
          status: nextStock === 0 ? 'out_of_stock' : nextStock <= 10 ? 'low_stock' : batch.status,
          updatedAt: now,
        };
      })
    );
    setAllStockMovements(prev => [...newMovements, ...prev]);

    const nextItems = target.items.map(item => ({
      ...item,
      dispatchedQuantity: item.dispatchedQuantity + (qtyByItem.get(item.id) || 0),
    }));
    const totalDispatchedQty = nextItems.reduce((s, i) => s + i.dispatchedQuantity, 0);
    const inTransitValuationPtr = Math.round(
      nextItems.reduce(
        (s, i) => s + Math.max(0, i.dispatchedQuantity - i.receivedQuantity - i.damagedQuantity - i.missingQuantity) * i.unitCostPtr,
        0
      ) * 100
    ) / 100;

    const updated: StockTransfer = {
      ...target,
      status: 'IN_TRANSIT',
      dispatchReference: payload.dispatchReference || target.dispatchReference || null,
      transporterName: payload.transporterName || target.transporterName || null,
      vehicleNumber: payload.vehicleNumber || target.vehicleNumber || null,
      dispatchedBy: currentUser.id,
      dispatchedAt: now,
      totalDispatchedQty,
      inTransitValuationPtr,
      items: nextItems,
      updatedAt: now,
    };
    setStockTransfers(prev => prev.map(t => (t.id === transferId ? updated : t)));
    return { ok: true, transfer: updated };
  };

  const receiveStockTransfer: PharmacyContextType['receiveStockTransfer'] = async (transferId, payload) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.receiveStockTransfer(apiSession, transferId, payload);
        await refreshMultiBranchData();
        return { ok: true, transfer: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Receipt failed' };
      }
    }

    const target = stockTransfers.find(t => t.id === transferId);
    if (!target) return { ok: false, error: 'Transfer not found.' };
    if (!['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(target.status)) {
      return { ok: false, error: `Transfer status '${target.status}' cannot receive stock.` };
    }

    for (const line of payload.items) {
      const item = target.items.find(i => i.id === line.itemId);
      if (!item) return { ok: false, error: `Transfer item '${line.itemId}' not found.` };
      const pending = item.dispatchedQuantity - (item.receivedQuantity + item.damagedQuantity + item.missingQuantity);
      const totalAccounting = (line.receivedQuantity || 0) + (line.damagedQuantity || 0) + (line.missingQuantity || 0);
      if (totalAccounting <= 0) continue;
      if (totalAccounting > pending) {
        return {
          ok: false,
          error: `Accepted + damaged + missing (${totalAccounting}) exceeds remaining dispatched quantity (${pending}) for ${item.medicineName}.`,
        };
      }
      if (((line.damagedQuantity || 0) > 0 || (line.missingQuantity || 0) > 0) && !line.discrepancyReason?.trim()) {
        return { ok: false, error: `Discrepancy reason is mandatory for damaged or missing units on ${item.medicineName}.` };
      }
    }

    const now = new Date().toISOString();
    const addedBatches: InventoryBatch[] = [];
    const addedMovements: StockMovement[] = [];
    const batchIncrements = new Map<string, number>();

    const nextItems = target.items.map(item => {
      const line = payload.items.find(l => l.itemId === item.id);
      if (!line) return item;
      const rec = line.receivedQuantity || 0;
      const dmg = line.damagedQuantity || 0;
      const mis = line.missingQuantity || 0;
      if (rec + dmg + mis === 0) return item;

      let destBatchId = item.destinationBatchId;
      if (rec > 0) {
        const existingDest = allInventory.find(
          b =>
            (b.branchId || 'main') === target.destinationBranchId &&
            b.medicineId === item.medicineId &&
            b.batchNumber === item.batchNumber
        );
        if (existingDest) {
          destBatchId = existingDest.id;
          batchIncrements.set(existingDest.id, (batchIncrements.get(existingDest.id) || 0) + rec);
          addedMovements.push({
            id: `mov-trfin-${Date.now().toString(36)}-${item.id.slice(-4)}`,
            tenantId: store.id,
            branchId: target.destinationBranchId,
            medicineId: item.medicineId,
            batchId: existingDest.id,
            batchNumber: item.batchNumber,
            medicineName: item.medicineName,
            movementType: 'STOCK_TRANSFER_IN',
            quantityChange: rec,
            previousQuantity: existingDest.currentStock,
            newQuantity: existingDest.currentStock + rec,
            referenceType: 'stock_transfer',
            referenceId: target.id,
            reason: `Received from ${target.sourceBranchName} (${target.transferNumber})`,
            performedBy: currentUser.name,
            timestamp: now,
          });
        } else {
          destBatchId = `batch-${target.destinationBranchCode.toLowerCase()}-${Date.now().toString(36)}-${item.id.slice(-3)}`;
          addedBatches.push({
            id: destBatchId,
            branchId: target.destinationBranchId,
            medicineId: item.medicineId,
            brandName: item.medicineName,
            saltComposition: item.saltComposition || '',
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            packSize: item.packSize || 'Strip',
            mrp: item.mrp,
            ptr: item.unitCostPtr,
            sellingPrice: item.sellingPrice,
            currentStock: rec,
            rackLocation: `${target.destinationBranchCode} Transfer Inward`,
            status: rec <= 10 ? 'low_stock' : 'normal',
            createdAt: now,
            updatedAt: now,
          });
          addedMovements.push({
            id: `mov-trfin-${Date.now().toString(36)}-${item.id.slice(-4)}`,
            tenantId: store.id,
            branchId: target.destinationBranchId,
            medicineId: item.medicineId,
            batchId: destBatchId,
            batchNumber: item.batchNumber,
            medicineName: item.medicineName,
            movementType: 'STOCK_TRANSFER_IN',
            quantityChange: rec,
            previousQuantity: 0,
            newQuantity: rec,
            referenceType: 'stock_transfer',
            referenceId: target.id,
            reason: `Received from ${target.sourceBranchName} (${target.transferNumber})`,
            performedBy: currentUser.name,
            timestamp: now,
          });
        }
      }

      return {
        ...item,
        destinationBatchId: destBatchId,
        receivedQuantity: item.receivedQuantity + rec,
        damagedQuantity: item.damagedQuantity + dmg,
        missingQuantity: item.missingQuantity + mis,
        discrepancyReason: line.discrepancyReason || item.discrepancyReason,
      };
    });

    if (batchIncrements.size > 0 || addedBatches.length > 0) {
      setAllInventory(prev => [
        ...addedBatches,
        ...prev.map(b => {
          const inc = batchIncrements.get(b.id);
          if (!inc) return b;
          const nextStock = b.currentStock + inc;
          return {
            ...b,
            currentStock: nextStock,
            status: (nextStock <= 10 ? 'low_stock' : 'normal') as InventoryBatch['status'],
            updatedAt: now,
          };
        }),
      ]);
      setAllStockMovements(prev => [...addedMovements, ...prev]);
    }

    const totalReceivedQty = nextItems.reduce((s, i) => s + i.receivedQuantity, 0);
    const totalDamagedQty = nextItems.reduce((s, i) => s + i.damagedQuantity, 0);
    const totalMissingQty = nextItems.reduce((s, i) => s + i.missingQuantity, 0);
    const hasDiscrepancies = totalDamagedQty > 0 || totalMissingQty > 0;
    const allDispatchedAccounted = nextItems.every(
      i => i.receivedQuantity + i.damagedQuantity + i.missingQuantity >= i.dispatchedQuantity
    );
    const allRequestedDispatched = nextItems.every(
      i => i.dispatchedQuantity >= (i.approvedQuantity || i.requestedQuantity)
    );
    const inTransitValuationPtr = Math.round(
      nextItems.reduce(
        (s, i) => s + Math.max(0, i.dispatchedQuantity - i.receivedQuantity - i.damagedQuantity - i.missingQuantity) * i.unitCostPtr,
        0
      ) * 100
    ) / 100;

    const nextStatus: StockTransfer['status'] =
      allDispatchedAccounted && allRequestedDispatched ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

    const updated: StockTransfer = {
      ...target,
      status: nextStatus,
      receivedBy: currentUser.id,
      receivedAt: now,
      totalReceivedQty,
      totalDamagedQty,
      totalMissingQty,
      inTransitValuationPtr,
      hasDiscrepancies,
      items: nextItems,
      updatedAt: now,
    };
    setStockTransfers(prev => prev.map(t => (t.id === transferId ? updated : t)));
    return { ok: true, transfer: updated };
  };

  const reconcileStockTransfer: PharmacyContextType['reconcileStockTransfer'] = async (
    transferId,
    reconciliationNotes
  ) => {
    if (apiSession.bearerToken) {
      try {
        const res = await branchTransferApi.reconcileStockTransfer(apiSession, transferId, reconciliationNotes);
        await refreshMultiBranchData();
        return { ok: true, transfer: res };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Reconciliation failed' };
      }
    }
    const target = stockTransfers.find(t => t.id === transferId);
    if (!target) return { ok: false, error: 'Transfer not found.' };
    const now = new Date().toISOString();
    const updated: StockTransfer = {
      ...target,
      status: 'CLOSED',
      reconciliationNotes,
      closedBy: currentUser.id,
      closedAt: now,
      items: target.items.map(i => ({
        ...i,
        discrepancyResolved: true,
        resolutionNotes: reconciliationNotes,
      })),
      updatedAt: now,
    };
    setStockTransfers(prev => prev.map(t => (t.id === transferId ? updated : t)));
    return { ok: true, transfer: updated };
  };

  return (
    <PharmacyContext.Provider
      value={{
        store,
        updateStore,
        currentUser,
        switchUserRole,
        usersList,
        apiSession,
        setApiSession,
        activeModule,
        setActiveModule,
        medicines,
        addMedicine,
        updateMedicine,
        archiveMedicine,
        inventory,
        allInventory,
        addInventoryBatch,
        updateBatchStock,
        adjustBatchStock,
        stockMovements,
        allStockMovements,
        expiryWarningDays,
        setExpiryWarningDays,
        branches,
        authorizedBranches,
        activeBranchId,
        activeBranch,
        consolidatedViewMode,
        setConsolidatedViewMode,
        switchActiveBranch,
        branchAuditLogs,
        createBranch,
        updateBranch,
        updateBranchSettings,
        setPrimaryBranch,
        changeBranchStatus,
        checkBranchClosure,
        closeBranch,
        assignEmployeeToBranch,
        removeEmployeeFromBranch,
        stockTransfers,
        createStockTransfer,
        submitStockTransfer,
        approveStockTransfer,
        rejectStockTransfer,
        cancelStockTransfer,
        dispatchStockTransfer,
        receiveStockTransfer,
        reconcileStockTransfer,
        refreshMultiBranchData,
        customers,
        addCustomer,
        updateCustomerRecord,
        updateCustomerKhata,
        customerLedgerEntries,
        appendCustomerLedgerEntry,
        customerPayments,
        appendCustomerPayment,
        suppliers,
        addSupplier,
        updateSupplierRecord,
        updateSupplierStatus,
        archiveSupplier,
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
        bills,
        allBills,
        createBill,
        cancelBill,
        processSalesReturn,
        recordBillPayment,
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
        invitationsList,
        inviteEmployee,
        resendInvitation,
        cancelInvitation,
        updateEmployeeRole,
        updateEmployeeBranches,
        updateEmployeePermissions,
        updateEmployeeStatus,
        hasUserPermission,
        isStoreOnboardingOpen,
        setIsStoreOnboardingOpen,
        isLoginModalOpen,
        setIsLoginModalOpen,
        activeQuickModal,
        setActiveQuickModal,
        printInvoiceData,
        setPrintInvoiceData,
        previewAccounts,
        setPreviewAccounts,
        previewExpenses,
        setPreviewExpenses,
        previewManualJournals,
        setPreviewManualJournals,
        previewBankAccounts,
        setPreviewBankAccounts,
        previewReconciliations,
        setPreviewReconciliations,
        previewPeriods,
        setPreviewPeriods,
      }}
    >
      {children}
    </PharmacyContext.Provider>
  );
};

export const usePharmacy = () => {
  const context = useContext(PharmacyContext);
  if (!context) {
    throw new Error('usePharmacy must be used within a PharmacyProvider');
  }
  return context;
};
