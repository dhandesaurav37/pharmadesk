/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState } from 'react';
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
} from '../lib/sampleData.ts';

interface PharmacyContextType {
  store: PharmacyStore;
  updateStore: (updated: Partial<PharmacyStore>) => void;
  currentUser: UserProfile;
  switchUserRole: (role: UserRole) => void;
  usersList: UserProfile[];
  
  activeModule: NavigationModule;
  setActiveModule: (module: NavigationModule) => void;
  
  medicines: MedicineMaster[];
  addMedicine: (med: Omit<MedicineMaster, 'id'>) => MedicineMaster;
  updateMedicine: (id: string, updated: Partial<MedicineMaster>) => void;
  archiveMedicine: (id: string, archive?: boolean) => void;
  
  inventory: InventoryBatch[];
  addInventoryBatch: (batch: Omit<InventoryBatch, 'id' | 'status'>) => void;
  updateBatchStock: (batchId: string, newStock: number) => void;
  adjustBatchStock: (batchId: string, quantityChange: number, movementType: StockMovementType, reason: string) => void;
  stockMovements: StockMovement[];
  expiryWarningDays: number;
  setExpiryWarningDays: (days: number) => void;
  
  customers: Customer[];
  addCustomer: (cust: Omit<Customer, 'id' | 'totalVisits' | 'totalPurchased' | 'lastVisit'>) => Customer;
  updateCustomerKhata: (customerId: string, amountChange: number) => void;
  
  suppliers: Supplier[];
  addSupplier: (sup: Omit<Supplier, 'id'>) => Supplier;
  
  bills: BillInvoice[];
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
}

const PharmacyContext = createContext<PharmacyContextType | undefined>(undefined);

export const PharmacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Ephemeral client UI session state; authoritative business records persist in Cloud Firestore via /api/v1
  const [store, setStore] = useState<PharmacyStore>(INITIAL_STORE);
  const [currentUser, setCurrentUser] = useState<UserProfile>(SAMPLE_USERS[0]);
  const [activeModule, setActiveModule] = useState<NavigationModule>('dashboard');

  const [medicines, setMedicines] = useState<MedicineMaster[]>(INITIAL_MEDICINES);
  const [inventory, setInventory] = useState<InventoryBatch[]>(INITIAL_INVENTORY);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [bills, setBills] = useState<BillInvoice[]>(INITIAL_BILLS);
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
  const [stockMovements, setStockMovements] = useState<StockMovement[]>(INITIAL_STOCK_MOVEMENTS);
  const [expiryWarningDays, setExpiryWarningDays] = useState<number>(90);

  const updateStore = (updated: Partial<PharmacyStore>) => {
    setStore(prev => ({ ...prev, ...updated }));
  };

  const switchUserRole = (role: UserRole) => {
    const targetUser = usersList.find(u => u.role === role) || SAMPLE_USERS.find(u => u.role === role) || SAMPLE_USERS[0];
    setCurrentUser(targetUser);
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
    const branchId = batchData.branchId || store.branchName || 'main';

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
    const target = inventory.find(b => b.id === batchId);
    if (!target) return;

    const previousQuantity = target.currentStock;
    const newQuantity = Math.max(0, previousQuantity + quantityChange);

    updateBatchStock(batchId, newQuantity);

    const movement: StockMovement = {
      id: `mov-${Date.now().toString(36)}`,
      branchId: target.branchId || store.branchName || 'main',
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
    const newCustomer: Customer = {
      ...custData,
      id: `cust-${Date.now().toString(36)}`,
      totalVisits: 1,
      totalPurchased: 0,
      lastVisit: new Date().toISOString().split('T')[0],
    };
    setCustomers(prev => [newCustomer, ...prev]);
    return newCustomer;
  };

  const updateCustomerKhata = (customerId: string, amountChange: number) => {
    setCustomers(prev =>
      prev.map(c =>
        c.id === customerId
          ? { ...c, khataBalance: Math.max(0, c.khataBalance + amountChange) }
          : c
      )
    );
  };

  const addSupplier = (supData: Omit<Supplier, 'id'>) => {
    const newSupplier: Supplier = {
      ...supData,
      id: `sup-${Date.now().toString(36)}`,
    };
    setSuppliers(prev => [newSupplier, ...prev]);
    return newSupplier;
  };

  const createBill = (billData: Omit<BillInvoice, 'id' | 'invoiceNumber' | 'timestamp' | 'cashierName'>) => {
    const invoiceSeq = (bills.length + 1049).toString();
    const invoiceNumber = `${store.invoicePrefix}-2026-${invoiceSeq}`;
    const now = new Date();
    const formattedDate = `${now.toISOString().split('T')[0]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const newBill: BillInvoice = {
      ...billData,
      id: `bill-${Date.now().toString(36)}`,
      invoiceNumber,
      timestamp: formattedDate,
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

    // Update customer if Khata or existing
    if (billData.customerPhone) {
      setCustomers(prev => {
        const found = prev.find(c => c.phone === billData.customerPhone);
        if (found) {
          return prev.map(c =>
            c.id === found.id
              ? {
                  ...c,
                  totalVisits: c.totalVisits + 1,
                  totalPurchased: c.totalPurchased + billData.grandTotal,
                  lastVisit: now.toISOString().split('T')[0],
                  khataBalance:
                    billData.paymentMode === 'khata_credit'
                      ? c.khataBalance + billData.grandTotal
                      : c.khataBalance,
                }
              : c
          );
        } else if (billData.customerName && billData.customerName !== 'Walk-in Customer') {
          const newCust: Customer = {
            id: `cust-${Date.now().toString(36)}`,
            name: billData.customerName,
            phone: billData.customerPhone,
            doctorName: billData.doctorName,
            khataBalance: billData.paymentMode === 'khata_credit' ? billData.grandTotal : 0,
            totalVisits: 1,
            totalPurchased: billData.grandTotal,
            lastVisit: now.toISOString().split('T')[0],
          };
          return [newCust, ...prev];
        }
        return prev;
      });
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
          branchId: 'main',
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

    setBills(prev =>
      prev.map(b => (b.id === invoiceId ? { ...b, status: 'cancelled', notes: reason } : b))
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
      totalRefund += refund;

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
            branchId: 'main',
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

    setBills(prev =>
      prev.map(b =>
        b.id === invoiceId
          ? {
              ...b,
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
          timestamp: new Date().toISOString(),
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
    if (currentUser.role === 'owner') return true;
    const overrides = currentUser.permissionOverrides;
    if (overrides?.revoked?.includes(permissionKey)) return false;
    if (overrides?.granted?.includes(permissionKey)) return true;

    // Check role default permissions
    switch (currentUser.role) {
      case 'pharmacist':
        return [
          'dashboard.view',
          'billing.view',
          'billing.create',
          'billing.return',
          'billing.discount',
          'medicines.view',
          'medicines.create',
          'medicines.edit',
          'inventory.view',
          'inventory.write',
          'inventory.adjust',
          'inventory.ptr_margin',
          'customers.view',
          'customers.create',
          'customers.khata_view',
          'customers.khata_settle',
          'suppliers.manage',
          'purchases.manage',
          'reports.view',
        ].includes(permissionKey);
      case 'cashier':
        return [
          'dashboard.view',
          'billing.view',
          'billing.create',
          'medicines.view',
          'inventory.view',
          'customers.view',
          'customers.create',
          'customers.khata_view',
          'customers.khata_settle',
          'reports.view',
        ].includes(permissionKey);
      case 'helper':
        return ['medicines.view', 'inventory.view'].includes(permissionKey);
      case 'auditor':
        return [
          'dashboard.view',
          'medicines.view',
          'inventory.view',
          'inventory.ptr_margin',
          'reports.view',
          'reports.financial',
          'reports.gst',
          'audit.view',
        ].includes(permissionKey);
      default:
        return false;
    }
  };

  return (
    <PharmacyContext.Provider
      value={{
        store,
        updateStore,
        currentUser,
        switchUserRole,
        usersList,
        activeModule,
        setActiveModule,
        medicines,
        addMedicine,
        updateMedicine,
        archiveMedicine,
        inventory,
        addInventoryBatch,
        updateBatchStock,
        adjustBatchStock,
        stockMovements,
        expiryWarningDays,
        setExpiryWarningDays,
        customers,
        addCustomer,
        updateCustomerKhata,
        suppliers,
        addSupplier,
        bills,
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
