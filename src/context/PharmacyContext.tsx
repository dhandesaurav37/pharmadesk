/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  PharmacyStore,
  UserProfile,
  UserRole,
  MedicineMaster,
  InventoryBatch,
  BillInvoice,
  Customer,
  Supplier,
  NotificationItem,
  NavigationModule,
} from '../types/pharmacy.ts';
import {
  INITIAL_STORE,
  SAMPLE_USERS,
  INITIAL_MEDICINES,
  INITIAL_INVENTORY,
  INITIAL_CUSTOMERS,
  INITIAL_SUPPLIERS,
  INITIAL_BILLS,
  INITIAL_NOTIFICATIONS,
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
  
  inventory: InventoryBatch[];
  addInventoryBatch: (batch: Omit<InventoryBatch, 'id' | 'status'>) => void;
  updateBatchStock: (batchId: string, newStock: number) => void;
  
  customers: Customer[];
  addCustomer: (cust: Omit<Customer, 'id' | 'totalVisits' | 'totalPurchased' | 'lastVisit'>) => Customer;
  updateCustomerKhata: (customerId: string, amountChange: number) => void;
  
  suppliers: Supplier[];
  addSupplier: (sup: Omit<Supplier, 'id'>) => Supplier;
  
  bills: BillInvoice[];
  createBill: (billData: Omit<BillInvoice, 'id' | 'invoiceNumber' | 'timestamp' | 'cashierName'>) => BillInvoice;
  
  notifications: NotificationItem[];
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  
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
  const [store, setStore] = useState<PharmacyStore>(() => {
    const saved = localStorage.getItem('pharmadesk_store') || localStorage.getItem('medidesk_store');
    return saved ? JSON.parse(saved) : INITIAL_STORE;
  });

  const [currentUser, setCurrentUser] = useState<UserProfile>(() => {
    const savedRole = (localStorage.getItem('pharmadesk_user_role') || localStorage.getItem('medidesk_user_role')) as UserRole;
    const found = SAMPLE_USERS.find(u => u.role === savedRole);
    return found || SAMPLE_USERS[0];
  });

  const [activeModule, setActiveModule] = useState<NavigationModule>('dashboard');

  const [medicines, setMedicines] = useState<MedicineMaster[]>(() => {
    const saved = localStorage.getItem('pharmadesk_medicines') || localStorage.getItem('medidesk_medicines');
    return saved ? JSON.parse(saved) : INITIAL_MEDICINES;
  });

  const [inventory, setInventory] = useState<InventoryBatch[]>(() => {
    const saved = localStorage.getItem('pharmadesk_inventory') || localStorage.getItem('medidesk_inventory');
    return saved ? JSON.parse(saved) : INITIAL_INVENTORY;
  });

  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem('pharmadesk_customers') || localStorage.getItem('medidesk_customers');
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    const saved = localStorage.getItem('pharmadesk_suppliers') || localStorage.getItem('medidesk_suppliers');
    return saved ? JSON.parse(saved) : INITIAL_SUPPLIERS;
  });

  const [bills, setBills] = useState<BillInvoice[]>(() => {
    const saved = localStorage.getItem('pharmadesk_bills') || localStorage.getItem('medidesk_bills');
    return saved ? JSON.parse(saved) : INITIAL_BILLS;
  });

  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Modals
  const [isStoreOnboardingOpen, setIsStoreOnboardingOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [activeQuickModal, setActiveQuickModal] = useState<'medicine' | 'customer' | 'stock' | null>(null);
  const [printInvoiceData, setPrintInvoiceData] = useState<BillInvoice | null>(null);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('pharmadesk_store', JSON.stringify(store));
  }, [store]);

  useEffect(() => {
    localStorage.setItem('pharmadesk_medicines', JSON.stringify(medicines));
  }, [medicines]);

  useEffect(() => {
    localStorage.setItem('pharmadesk_inventory', JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem('pharmadesk_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('pharmadesk_bills', JSON.stringify(bills));
  }, [bills]);

  const updateStore = (updated: Partial<PharmacyStore>) => {
    setStore(prev => ({ ...prev, ...updated }));
  };

  const switchUserRole = (role: UserRole) => {
    const targetUser = SAMPLE_USERS.find(u => u.role === role) || SAMPLE_USERS[0];
    setCurrentUser(targetUser);
    localStorage.setItem('pharmadesk_user_role', role);
  };

  const addMedicine = (med: Omit<MedicineMaster, 'id'>) => {
    const newMed: MedicineMaster = {
      ...med,
      id: `med-${Date.now().toString(36)}`,
    };
    setMedicines(prev => [newMed, ...prev]);
    return newMed;
  };

  const addInventoryBatch = (batchData: Omit<InventoryBatch, 'id' | 'status'>) => {
    const today = new Date();
    const expiry = new Date(batchData.expiryDate + '-01');
    const diffMonths = (expiry.getFullYear() - today.getFullYear()) * 12 + (expiry.getMonth() - today.getMonth());
    
    let status: 'normal' | 'low_stock' | 'near_expiry' | 'expired' = 'normal';
    if (diffMonths <= 0) {
      status = 'expired';
    } else if (diffMonths <= 3) {
      status = 'near_expiry';
    } else if (batchData.currentStock <= 10) {
      status = 'low_stock';
    }

    const newBatch: InventoryBatch = {
      ...batchData,
      id: `batch-${Date.now().toString(36)}`,
      status,
    };
    setInventory(prev => [newBatch, ...prev]);
  };

  const updateBatchStock = (batchId: string, newStock: number) => {
    setInventory(prev =>
      prev.map(b => {
        if (b.id !== batchId) return b;
        const status = newStock <= 10 ? 'low_stock' : b.status === 'low_stock' ? 'normal' : b.status;
        return { ...b, currentStock: Math.max(0, newStock), status };
      })
    );
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

  const markNotificationRead = (id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  return (
    <PharmacyContext.Provider
      value={{
        store,
        updateStore,
        currentUser,
        switchUserRole,
        usersList: SAMPLE_USERS,
        activeModule,
        setActiveModule,
        medicines,
        addMedicine,
        inventory,
        addInventoryBatch,
        updateBatchStock,
        customers,
        addCustomer,
        updateCustomerKhata,
        suppliers,
        addSupplier,
        bills,
        createBill,
        notifications,
        markNotificationRead,
        markAllNotificationsRead,
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
