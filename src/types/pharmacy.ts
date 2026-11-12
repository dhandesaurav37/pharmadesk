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
  balanceDue: number;
  paymentStatus?: 'paid' | 'partial' | 'unpaid';
  payments?: PaymentRecord[];
  paymentMode: PaymentMode;
  status: 'paid' | 'credit' | 'completed' | 'cancelled' | 'partially_returned' | 'returned';
  cashierName: string;
  returns?: SalesReturn[];
  notes?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address?: string;
  doctorName?: string;
  khataBalance: number; // Outstanding credit amount in INR
  totalVisits: number;
  totalPurchased: number;
  lastVisit: string;
  notes?: string;
}

export interface Supplier {
  id: string;
  agencyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  city: string;
  dlNumber: string;
  gstin: string;
  outstandingBalance: number;
  paymentTerms: string; // e.g. "Net 15 days", "Net 30 days"
  rating?: number;
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
