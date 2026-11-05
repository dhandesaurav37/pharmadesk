/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'owner' | 'pharmacist' | 'cashier';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  storeId: string;
  avatarUrl?: string;
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
  status: 'normal' | 'low_stock' | 'near_expiry' | 'expired';
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

export type PaymentMode = 'cash' | 'upi' | 'card' | 'khata_credit';

export interface BillInvoice {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  customerName: string;
  customerPhone: string;
  doctorName?: string;
  items: CartItem[];
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  roundOff: number;
  grandTotal: number;
  paymentMode: PaymentMode;
  status: 'paid' | 'credit';
  cashierName: string;
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
