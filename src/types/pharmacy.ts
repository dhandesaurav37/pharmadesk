/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'owner' | 'pharmacist' | 'cashier' | 'helper' | 'auditor';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  storeId: string;
  avatarUrl?: string;
  status?: 'active' | 'suspended' | 'deactivated';
  assignedBranchIds?: string[];
  permissions?: string[];
  permissionOverrides?: {
    granted?: string[];
    revoked?: string[];
  };
}

export interface EmployeeInvitation {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  phone?: string | null;
  role: UserRole;
  assignedBranchIds: string[];
  permissionOverrides?: {
    granted?: string[];
    revoked?: string[];
  };
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled' | 'revoked';
  expiresAt: string;
  createdAt: string;
  createdBy: string;
}

export interface PharmacyStore {
  id: string;
  name: string;
  branchName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  dlNumber20B: string; // Drug License Form 20B (Retail allopathic)
  dlNumber21B: string; // Drug License Form 21B (Retail specified drugs)
  gstin: string;
  fssaiNumber: string;
  invoicePrefix: string;
  thermalPrinter: boolean;
  defaultDiscountPercent: number;
}

export type ScheduleCategory = 'OTC' | 'Schedule H' | 'Schedule H1' | 'Schedule X' | 'Narcotic';

export type MedicineCategory = 
  | 'Tablet'
  | 'Capsule'
  | 'Syrup'
  | 'Injection'
  | 'Ointment'
  | 'Drops'
  | 'Inhaler'
  | 'Powder'
  | 'Surgical';

export interface MedicineMaster {
  id: string;
  brandName: string;
  saltComposition: string;
  manufacturer: string;
  category: MedicineCategory;
  schedule: ScheduleCategory;
  rackLocation: string; // e.g. "Rack A-2", "Cold Storage (2-8°C)"
  packSize: string; // e.g. "10 Tablets", "100 ml", "1 Vial"
  hsnCode: string; // e.g. "300490"
  gstSlab: number; // 0, 5, 12, 18
  prescriptionRequired: boolean;
  minStockLevel: number; // reorder trigger threshold
  dosageForm?: string;
  strength?: string;
  uom?: string;
  barcode?: string;
  description?: string;
  status?: 'active' | 'inactive' | 'archived';
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryBatch {
  id: string;
  medicineId: string;
  brandName: string;
  saltComposition: string;
  batchNumber: string;
  expiryDate: string; // Format: "YYYY-MM"
  packSize: string;
  mrp: number; // Maximum Retail Price (INR)
  ptr: number; // Price To Retailer / Purchase price (INR)
  currentStock: number; // in packs/strips
  rackLocation: string;
  barcode?: string;
  status: 'normal' | 'low_stock' | 'near_expiry' | 'expired' | 'out_of_stock';
  branchId?: string;
  mfgDate?: string;
  sellingPrice?: number;
  quantityReceived?: number;
  freeQuantity?: number;
  supplierId?: string;
  supplierName?: string;
  purchaseReferenceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type StockMovementType =
  | 'OPENING_STOCK'
  | 'PURCHASE_RECEIPT'
  | 'SALE'
  | 'SALE_RETURN'
  | 'PURCHASE_RETURN'
  | 'DAMAGE'
  | 'EXPIRY'
  | 'MANUAL_ADJUSTMENT'
  | 'STOCK_TRANSFER_IN'
  | 'STOCK_TRANSFER_OUT';

export interface StockMovement {
  id: string;
  tenantId?: string;
  branchId: string;
  medicineId: string;
  batchId: string;
  batchNumber: string;
  medicineName: string;
  movementType: StockMovementType;
  quantityChange: number;
  previousQuantity: number;
  newQuantity: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
  performedBy: string;
  timestamp: string;
}

export interface CartItem {
  batchId: string;
  medicineId: string;
  brandName: string;
  saltComposition: string;
  batchNumber: string;
  expiryDate: string;
  packSize: string;
  mrp: number;
  discountPercent: number;
  gstSlab: number;
  quantity: number;
  availableStock: number;
  schedule: ScheduleCategory;
}

export type PaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer' | 'khata_credit';

export interface PaymentRecord {
  id: string;
  mode: PaymentMode;
  amount: number;
  referenceNumber?: string;
  timestamp: string;
}

export interface SalesReturnItem {
  batchId: string;
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitPrice: number;
  refundAmount: number;
  restocked: boolean;
}

export interface SalesReturn {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  items: SalesReturnItem[];
  totalRefundAmount: number;
  reason: string;
  returnedBy: string;
  timestamp: string;
}

export interface BillInvoice {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  branchId?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  doctorName?: string;
  doctorRegNumber?: string;
  items: CartItem[];
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst?: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number;
  khataCreditAmount?: number;
  balanceDue: number;
  creditTermsDays?: 0 | 7 | 15 | 30;
  dueDate?: string;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  payments?: PaymentRecord[];
  paymentMode: PaymentMode;
  status: 'paid' | 'credit' | 'completed' | 'cancelled' | 'partially_returned' | 'returned';
  cashierName: string;
  returns?: SalesReturn[];
  notes?: string;
}

export type CustomerType =
  | 'REGULAR'
  | 'VIP'
  | 'CHRONIC'
  | 'CORPORATE'
  | 'CLINIC'
  | 'SENIOR_CITIZEN';

export type CustomerGender = 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY';
export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type KhataPaymentMode = 'cash' | 'upi' | 'card' | 'bank_transfer';

export type LedgerEntryType =
  | 'CREDIT_PURCHASE'
  | 'CASH_PAYMENT'
  | 'UPI_PAYMENT'
  | 'CARD_PAYMENT'
  | 'BANK_TRANSFER'
  | 'CREDIT_NOTE'
  | 'DEBIT_ADJUSTMENT'
  | 'CREDIT_ADJUSTMENT'
  | 'OPENING_BALANCE'
  | 'REFUND';

export type LedgerDirection = 'DEBIT' | 'CREDIT';

export interface CustomerAccount {
  id: string;
  tenantId: string;
  primaryBranchId: string;
  name: string;
  phone: string;
  normalizedPhone?: string;
  phoneMasked?: boolean;
  khataRedacted?: boolean;
  alternatePhone?: string | null;
  email?: string | null;
  customerType: CustomerType;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  dateOfBirth?: string | null;
  gender?: CustomerGender | null;
  preferredDoctorName?: string | null;
  allergies?: string | null;
  chronicConditions?: string | null;
  gstin?: string | null;
  creditEnabled: boolean;
  creditLimit: number | null;
  creditTermsDays: 0 | 7 | 15 | 30;
  currentOutstandingBalance: number | null;
  advanceBalance: number | null;
  availableCredit?: number | null;
  isOverLimit?: boolean;
  totalPurchases: number;
  totalPayments: number | null;
  totalVisits: number;
  lastPurchaseDate?: string | null;
  lastPaymentDate?: string | null;
  status: CustomerStatus;
  isArchived: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
  sharedPhoneConfirmed?: boolean;
  notes?: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerLedgerEntry {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amount: number;
  appliedToBalance: number;
  advanceDelta: number;
  previousBalance: number;
  runningBalance: number;
  previousAdvanceBalance: number;
  runningAdvanceBalance: number;
  referenceType?: string | null;
  referenceId?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  paymentId?: string | null;
  returnId?: string | null;
  paymentMode?: string | null;
  referenceNumber?: string | null;
  description: string;
  reason?: string | null;
  operationRef?: string | null;
  performedBy: string;
  performedByName?: string | null;
  timestamp: string;
}

export interface KhataPaymentAllocation {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  previousBalanceDue: number;
  newBalanceDue: number;
}

export interface CustomerPayment {
  id: string;
  receiptNumber: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  customerName: string;
  amount: number;
  appliedToBalance: number;
  addedToAdvance: number;
  paymentMode: KhataPaymentMode;
  referenceNumber?: string | null;
  paymentDate: string;
  allocations: KhataPaymentAllocation[];
  notes?: string | null;
  recordedBy: string;
  recordedByName?: string | null;
  ledgerEntryId: string;
  timestamp: string;
}

export interface CustomerReconciliation {
  customerId: string;
  totalDebits: number;
  totalCredits: number;
  netLedgerBalance: number;
  expectedOutstandingBalance: number;
  expectedAdvanceBalance: number;
  storedOutstandingBalance: number;
  storedAdvanceBalance: number;
  discrepancy: number;
  isBalanced: boolean;
  entryCount: number;
}

export interface CustomerStatement {
  customer: CustomerAccount;
  period: { dateFrom: string; dateTo: string };
  openingBalance: number;
  periodDebits: number;
  periodCredits: number;
  closingBalance: number;
  currentOutstandingBalance: number;
  advanceBalance: number;
  entries: CustomerLedgerEntry[];
}

export interface OutstandingReportRow {
  customerId: string;
  name: string;
  phone: string;
  customerType: CustomerType;
  status: CustomerStatus;
  creditLimit: number;
  currentOutstandingBalance: number;
  advanceBalance: number;
  availableCredit: number;
  isOverLimit: boolean;
  unpaidInvoiceCount: number;
  overdueAmount: number;
  lastPurchaseDate?: string | null;
  lastPaymentDate?: string | null;
}

export interface OutstandingReport {
  customers: OutstandingReportRow[];
  totals: {
    totalCustomersWithDue: number;
    totalOutstanding: number;
    totalAdvance: number;
    totalOverdue: number;
    overLimitCount: number;
  };
}

export interface OverdueInvoiceRow {
  invoiceId: string;
  invoiceNumber: string;
  branchId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
  dueDate: string;
  daysOverdue: number;
  agingBucket: '1_15_days' | '16_30_days' | 'over_30_days';
  createdAt: string;
}

export interface OverdueReport {
  overdueInvoices: OverdueInvoiceRow[];
  agingSummary: {
    notYetDueAmount: number;
    dueTodayAmount: number;
    bucket1To15Days: number;
    bucket16To30Days: number;
    bucketOver30Days: number;
    totalOverdueAmount: number;
  };
}

export interface CreditSummaryDashboard {
  kpis: {
    totalCustomers: number;
    activeCreditAccounts: number;
    totalKhataOutstanding: number;
    totalAdvanceBalance: number;
    overdueAccountsCount: number;
    overdueTotalAmount: number;
    overLimitAccountsCount: number;
    blockedAccountsCount: number;
  };
  recentCreditSales: Array<{
    invoiceId: string;
    invoiceNumber: string;
    customerId?: string;
    customerName: string;
    grandTotal: number;
    balanceDue: number;
    dueDate?: string;
    createdAt: string;
  }>;
  topCustomersByPurchases: CustomerAccount[];
  highestOutstandingCustomers: CustomerAccount[];
  recentPayments: CustomerPayment[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  alternatePhone?: string | null;
  email?: string | null;
  customerType?: CustomerType;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  dateOfBirth?: string;
  gender?: CustomerGender;
  doctorName?: string;
  allergies?: string;
  chronicConditions?: string;
  gstin?: string;
  creditEnabled?: boolean;
  creditLimit?: number;
  creditTermsDays?: 0 | 7 | 15 | 30;
  khataBalance: number; // Outstanding credit amount in INR
  advanceBalance?: number;
  status?: CustomerStatus;
  isArchived?: boolean;
  totalVisits: number;
  totalPurchased: number;
  totalPayments?: number;
  lastVisit: string;
  lastPaymentDate?: string | null;
  notes?: string;
}

export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';
export type SupplierType =
  | 'DISTRIBUTOR'
  | 'MANUFACTURER'
  | 'C_AND_F'
  | 'WHOLESALER'
  | 'SURGICAL_VENDOR'
  | 'GENERIC_STOCKIST';

export interface SupplierBankDetails {
  accountHolderName?: string | null;
  accountNumber?: string | null;
  ifscCode?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  upiId?: string | null;
}

export interface SupplierAttachment {
  id: string;
  name: string;
  category: 'supplier_bills' | 'documents';
  storagePath: string;
  branchId: string;
  fileId: string;
  contentType?: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Supplier {
  id: string;
  supplierCode?: string;
  agencyName: string;
  legalName?: string;
  contactPerson: string;
  phone: string;
  alternatePhone?: string | null;
  email: string;
  city: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  billingAddress?: string;
  shippingAddress?: string;
  dlNumber: string;
  gstin: string;
  pan?: string | null;
  supplierType?: SupplierType;
  creditPeriodDays?: number;
  creditLimit?: number | null;
  openingBalance?: number | null;
  outstandingBalance: number;
  advanceBalance?: number | null;
  totalPurchases?: number | null;
  totalPayments?: number | null;
  lastPurchaseDate?: string | null;
  lastPaymentDate?: string | null;
  paymentTerms: string; // e.g. "Net 15 days", "Net 30 days"
  bankDetails?: SupplierBankDetails | null;
  bankDetailsRedacted?: boolean;
  financialsRedacted?: boolean;
  attachments?: SupplierAttachment[];
  notes?: string | null;
  status?: SupplierStatus;
  isArchived?: boolean;
  blockReason?: string | null;
  rating?: number;
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PARTIALLY_RECEIVED'
  | 'FULLY_RECEIVED'
  | 'CLOSED'
  | 'CANCELLED';

export interface PurchaseOrderLineItem {
  id: string;
  medicineId: string;
  medicineName: string;
  genericName: string;
  brand: string;
  packSize: string;
  hsnCode: string;
  orderedQuantity: number;
  freeQuantity: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  pendingQuantity: number;
  unitCost: number;
  mrp?: number | null;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierGstin?: string | null;
  supplierStateCode: string;
  tenantStateCode: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  orderDate: string;
  expectedDeliveryDate?: string | null;
  status: PurchaseOrderStatus;
  items: PurchaseOrderLineItem[];
  subtotal: number;
  totalDiscount: number;
  invoiceDiscount: number;
  otherCharges: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  totalOrderedQty: number;
  totalReceivedQty: number;
  totalPendingQty: number;
  paymentTerms: string;
  notes?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  cancellationReason?: string | null;
  closureReason?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type GrnStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

export interface GrnBatchLine {
  id: string;
  poItemId?: string | null;
  medicineId: string;
  medicineName: string;
  genericName: string;
  hsnCode: string;
  batchNumber: string;
  manufacturingDate?: string | null;
  expiryDate: string;
  receivedQuantity: number;
  acceptedQuantity: number;
  rejectedQuantity: number;
  freeQuantity: number;
  rejectionReason?: string | null;
  purchasePrice: number;
  mrp: number;
  sellingPrice: number;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
  rackLocation?: string | null;
  barcode?: string | null;
  inventoryBatchId?: string | null;
  shortExpiryWarning?: boolean;
  daysToExpiry?: number;
}

export interface GrnWarning {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  expiryDate: string;
  daysRemaining: number;
  message: string;
}

export interface GoodsReceiptNote {
  id: string;
  grnNumber: string;
  tenantId: string;
  branchId: string;
  poId?: string | null;
  poNumber?: string | null;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierGstin?: string | null;
  supplierInvoiceNumber?: string | null;
  supplierInvoiceDate?: string | null;
  receiptDate: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  status: GrnStatus;
  items: GrnBatchLine[];
  subtotal: number;
  totalDiscount: number;
  invoiceDiscount: number;
  otherCharges: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  grandTotal: number;
  totalReceivedQty: number;
  totalAcceptedQty: number;
  totalRejectedQty: number;
  totalFreeQty: number;
  warnings: GrnWarning[];
  shortExpiryThresholdDays: number;
  allowOverReceiptUsed: boolean;
  linkedInvoiceId?: string | null;
  notes?: string | null;
  reversalReason?: string | null;
  reversedAt?: string | null;
  createdBy: string;
  createdAt: string;
}

export type SupplierInvoicePaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'REVERSED';
export type SupplierPaymentMode =
  | 'CASH'
  | 'UPI'
  | 'CARD'
  | 'BANK_TRANSFER'
  | 'NEFT_RTGS'
  | 'CHEQUE'
  | 'ADVANCE_ADJUSTMENT';

export interface SupplierInvoice {
  id: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  supplierGstin?: string | null;
  grnId?: string | null;
  grnNumber?: string | null;
  poId?: string | null;
  poNumber?: string | null;
  supplierInvoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  placeOfSupplyStateCode: string;
  isInterState: boolean;
  subtotal: number;
  totalDiscount: number;
  otherCharges: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  roundOff: number;
  totalAmount: number;
  amountPaid: number;
  creditNoteAmount: number;
  outstandingAmount: number;
  paymentStatus: SupplierInvoicePaymentStatus;
  recognitionBasis: 'GRN' | 'DIRECT_BILL';
  notes?: string | null;
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  paymentNumber: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  paymentDate: string;
  paymentMode: SupplierPaymentMode;
  amount: number;
  allocatedTotal: number;
  advanceAdded: number;
  referenceNumber?: string | null;
  notes?: string | null;
  allocations: Array<{
    invoiceId: string;
    supplierInvoiceNumber: string;
    allocatedAmount: number;
  }>;
  createdBy: string;
  createdAt: string;
}

export interface SupplierReturnItem {
  batchId: string;
  batchNumber: string;
  medicineId: string;
  medicineName: string;
  quantity: number;
  unitCost: number;
  gstRate: number;
  taxableAmount: number;
  taxAmount: number;
  lineTotal: number;
  reason: string;
}

export interface SupplierReturn {
  id: string;
  returnNumber: string;
  tenantId: string;
  branchId: string;
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  grnId: string;
  grnNumber: string;
  linkedInvoiceId?: string | null;
  creditNoteNumber: string;
  returnDate: string;
  status: 'POSTED' | 'PENDING_APPROVAL';
  items: SupplierReturnItem[];
  subtotal: number;
  totalTax: number;
  totalAmount: number;
  payableReduced: number;
  advanceCredited: number;
  reason: string;
  createdBy: string;
  createdAt: string;
}

export interface SupplierStatementEntry {
  date: string;
  type: string;
  reference: string;
  description: string;
  debitInr: number;
  creditInr: number;
  balanceInr: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'alert' | 'info' | 'success';
  timestamp: string;
  actionModule?: NavigationModule;
  read: boolean;
}

export type NavigationModule = 
  | 'dashboard'
  | 'billing'
  | 'medicines'
  | 'inventory'
  | 'customers'
  | 'suppliers'
  | 'purchases'
  | 'accounts'
  | 'employees'
  | 'reports'
  | 'settings';
