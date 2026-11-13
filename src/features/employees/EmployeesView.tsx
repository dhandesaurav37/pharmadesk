/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  ShieldCheck,
  Mail,
  Phone,
  Building2,
  Plus,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Key,
  Search,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Edit3,
  Ban,
  Copy,
  CheckCheck,
  Shield,
  Eye,
  Info,
  Sparkles,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { UserProfile, UserRole, EmployeeInvitation } from '../../types/pharmacy.ts';

// Categorized permission definitions matching PharmaDesk standard registry
interface PermDef {
  key: string;
  category: string;
  label: string;
  description: string;
}

const ALL_SYSTEM_PERMISSIONS: PermDef[] = [
  // Dashboard
  { key: 'dashboard.view', category: 'Dashboard', label: 'View Dashboard', description: 'Access operational dashboard and metrics' },

  // Billing
  { key: 'billing.view', category: 'Billing', label: 'View Billing', description: 'Access billing counter and sales queue' },
  { key: 'billing.create', category: 'Billing', label: 'Create Invoices', description: 'Dispense medicines and issue retail tax invoices' },
  { key: 'billing.cancel', category: 'Billing', label: 'Cancel Invoices', description: 'Cancel or void issued sales invoices' },
  { key: 'billing.return', category: 'Billing', label: 'Process Returns', description: 'Process patient medicine returns and refunds' },
  { key: 'billing.discount', category: 'Billing', label: 'Custom Discount', description: 'Apply custom invoice discounts above standard limit' },
  { key: 'billing.schedule_h1', category: 'Billing', label: 'Dispense Schedule H1/X', description: 'Dispense controlled Schedule H1 and X medications' },

  // Medicines
  { key: 'medicines.view', category: 'Medicines', label: 'View Medicines', description: 'View medicine formulations and formulary' },
  { key: 'medicines.create', category: 'Medicines', label: 'Add Medicines', description: 'Add new medicine products to catalogue' },
  { key: 'medicines.edit', category: 'Medicines', label: 'Edit Medicines', description: 'Edit drug formulations, HSN, and GST rates' },
  { key: 'medicines.delete', category: 'Medicines', label: 'Deactivate Medicines', description: 'Deactivate or retire medicine products' },

  // Inventory
  { key: 'inventory.view', category: 'Inventory', label: 'View Stock', description: 'View batch stock quantities and shelf locations' },
  { key: 'inventory.write', category: 'Inventory', label: 'Update Stock', description: 'Inward stock and create inventory batches' },
  { key: 'inventory.adjust', category: 'Inventory', label: 'Adjust Stock', description: 'Perform physical count adjustments and reconciliation' },
  { key: 'inventory.ptr_margin', category: 'Inventory', label: 'View PTR & Margins', description: 'View wholesale purchase rates (PTR) and margins' },
  { key: 'inventory.transfer', category: 'Inventory', label: 'Branch Transfers', description: 'Transfer stock between pharmacy branches' },
  { key: 'inventory.dispose', category: 'Inventory', label: 'Dispose Expired Stock', description: 'Record disposal or write-offs of expired batches' },

  // Customers
  { key: 'customers.view', category: 'Customers', label: 'View Customers', description: 'View patient directory and purchase history' },
  { key: 'customers.create', category: 'Customers', label: 'Create Customers', description: 'Register new customers and patients' },
  { key: 'customers.khata_view', category: 'Customers', label: 'View Khata Balance', description: 'View patient Khata credit balance and ledger' },
  { key: 'customers.khata_settle', category: 'Customers', label: 'Settle Khata', description: 'Accept repayments against Khata credit' },

  // Suppliers & Purchases
  { key: 'suppliers.manage', category: 'Suppliers', label: 'Manage Suppliers', description: 'Add and edit distributor profiles' },
  { key: 'purchases.manage', category: 'Purchases', label: 'Manage Purchases', description: 'Create purchase orders and inward distributor bills' },

  // Staff & Administration
  { key: 'employees.view', category: 'Staff', label: 'View Employees', description: 'View employee directory and assignments' },
  { key: 'employees.manage', category: 'Staff', label: 'Manage Staff', description: 'Manage employee roles and permissions' },
  { key: 'employees.invite', category: 'Staff', label: 'Invite Staff', description: 'Invite new staff members to pharmacy' },
  { key: 'employees.deactivate', category: 'Staff', label: 'Deactivate Staff', description: 'Revoke employee access and memberships' },
  { key: 'branches.manage', category: 'Branches', label: 'Manage Branches', description: 'Configure pharmacy branches and counters' },

  // Reports
  { key: 'reports.view', category: 'Reports', label: 'View Reports', description: 'Access standard sales and operational reports' },
  { key: 'reports.financial', category: 'Reports', label: 'Financial Reports', description: 'View profit & loss, cash register, and tax reports' },
  { key: 'reports.gst', category: 'Reports', label: 'GST Reports', description: 'Export GSTR-1 and GSTR-3B tax reports' },

  // Settings & Audit
  { key: 'settings.manage', category: 'Settings', label: 'Manage Settings', description: 'Configure drug licenses, GSTIN, and printer' },
  { key: 'audit.view', category: 'Audit', label: 'View Audit Logs', description: 'Inspect security and transaction audit trails' },
];

const DEFAULT_ROLE_PERMS: Record<UserRole, string[]> = {
  owner: ['*'],
  pharmacist: [
    'dashboard.view', 'billing.view', 'billing.create', 'billing.return', 'billing.discount', 'billing.schedule_h1',
    'medicines.view', 'medicines.create', 'medicines.edit',
    'inventory.view', 'inventory.write', 'inventory.adjust', 'inventory.ptr_margin', 'inventory.transfer', 'inventory.dispose',
    'customers.view', 'customers.create', 'customers.khata_view', 'customers.khata_settle',
    'suppliers.manage', 'purchases.manage', 'reports.view',
  ],
  cashier: [
    'dashboard.view', 'billing.view', 'billing.create',
    'medicines.view', 'inventory.view',
    'customers.view', 'customers.create', 'customers.khata_view', 'customers.khata_settle',
    'reports.view',
  ],
  helper: [
    'medicines.view', 'inventory.view',
  ],
  auditor: [
    'dashboard.view', 'medicines.view', 'inventory.view', 'inventory.ptr_margin',
    'reports.view', 'reports.financial', 'reports.gst', 'audit.view',
  ],
};

const ROLE_INFO: Record<UserRole, { title: string; badgeColor: string; description: string; legalContext: string }> = {
  owner: {
    title: 'Store Owner / Super Admin',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
    description: 'Full unconstrained administrative access across all store branches, accounting, tax reports, and staff management.',
    legalContext: 'Primary Drug License licensee / proprietor with full statutory authority.',
  },
  pharmacist: {
    title: 'Registered Pharmacist',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    description: 'Dispensing, Schedule H/H1/X validation, inventory batch management, purchase inwards, and returns.',
    legalContext: 'Complies with Pharmacy Act 1948 & D&C Rules: Authorized to dispense Schedule H & H1 medications.',
  },
  cashier: {
    title: 'Billing Cashier',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    description: 'Fast POS billing, cash/UPI collection, customer khata receipts, and basic receipt generation.',
    legalContext: 'Point-of-Sale counter operator: Restricted from Schedule H1/X override or purchase inward alterations.',
  },
  helper: {
    title: 'Stock Helper / Boy',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Shelf location check, batch finding, and inventory viewing. No billing or rate modification rights.',
    legalContext: 'Support staff for stock finding and order packing: No drug dispensing authorization.',
  },
  auditor: {
    title: 'Financial & Tax Auditor',
    badgeColor: 'bg-slate-100 text-slate-800 border-slate-200',
    description: 'Read-only access to sales books, GST reports, inventory valuation, and audit trail logs.',
    legalContext: 'External CA or Internal Auditor: Strictly read-only financial compliance view.',
  },
};

export const EmployeesView: React.FC = () => {
  const {
    currentUser,
    usersList,
    invitationsList,
    store,
    inviteEmployee,
    resendInvitation,
    cancelInvitation,
    updateEmployeeRole,
    updateEmployeeBranches,
    updateEmployeePermissions,
    updateEmployeeStatus,
  } = usePharmacy();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'employees' | 'invitations' | 'matrix'>('employees');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<UserProfile | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);

  // Invite Form State
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('pharmacist');
  const [inviteBranches, setInviteBranches] = useState<string[]>([store.branchName || 'Main Store']);
  const [inviteGrantedPerms, setInviteGrantedPerms] = useState<string[]>([]);
  const [inviteRevokedPerms, setInviteRevokedPerms] = useState<string[]>([]);
  const [showInvitePermOverrides, setShowInvitePermOverrides] = useState(false);

  // Edit Employee Form State
  const [editRole, setEditRole] = useState<UserRole>('pharmacist');
  const [editBranches, setEditBranches] = useState<string[]>([]);
  const [editGrantedPerms, setEditGrantedPerms] = useState<string[]>([]);
  const [editRevokedPerms, setEditRevokedPerms] = useState<string[]>([]);
  const [showEditPermOverrides, setShowEditPermOverrides] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  // Available Store Branches (simulated multi-branch structure for pharmacy)
  const availableBranches = useMemo(() => {
    const defaultBranch = store.branchName || 'Main Store (H.O.)';
    return [
      { id: 'branch-main', name: defaultBranch },
      { id: 'branch-counter-2', name: 'Counter 2 (OPD)' },
      { id: 'branch-night-desk', name: 'Night Emergency Desk' },
    ];
  }, [store.branchName]);

  // Filtered Employees
  const filteredEmployees = useMemo(() => {
    return usersList.filter(user => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        user.name.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.phone.includes(q);

      if (!matchesSearch) return false;
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (statusFilter !== 'all' && (user.status || 'active') !== statusFilter) return false;
      return true;
    });
  }, [usersList, searchQuery, roleFilter, statusFilter]);

  // Counts
  const activeCount = usersList.filter(u => (u.status || 'active') === 'active').length;
  const suspendedCount = usersList.filter(u => u.status === 'suspended').length;
  const deactivatedCount = usersList.filter(u => u.status === 'deactivated').length;
  const pendingInvitesCount = invitationsList.filter(i => i.status === 'pending').length;

  const isOwner = currentUser.role === 'owner';

  // Open Edit Modal
  const handleOpenEdit = (emp: UserProfile) => {
    setEditingEmployee(emp);
    setEditRole(emp.role);
    setEditBranches(emp.assignedBranchIds && emp.assignedBranchIds.length > 0 ? emp.assignedBranchIds : ['branch-main']);
    setEditGrantedPerms(emp.permissionOverrides?.granted || []);
    setEditRevokedPerms(emp.permissionOverrides?.revoked || []);
    setShowEditPermOverrides(false);
    setShowDeactivateConfirm(false);
  };

  // Submit Edit Employee
  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    if (editRole !== editingEmployee.role) {
      updateEmployeeRole(editingEmployee.id, editRole);
    }
    updateEmployeeBranches(editingEmployee.id, editBranches);
    updateEmployeePermissions(editingEmployee.id, {
      granted: editGrantedPerms,
      revoked: editRevokedPerms,
    });

    setEditingEmployee(null);
  };

  // Toggle status
  const handleStatusChange = (status: 'active' | 'suspended' | 'deactivated') => {
    if (!editingEmployee) return;
    updateEmployeeStatus(editingEmployee.id, status);
    setEditingEmployee({ ...editingEmployee, status });
    setShowDeactivateConfirm(false);
  };

  // Submit Invite
  const handleCreateInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    const newInvite = inviteEmployee({
      email: inviteEmail.trim(),
      name: inviteName.trim(),
      phone: invitePhone.trim() || undefined,
      role: inviteRole,
      assignedBranchIds: inviteBranches,
      permissionOverrides: (inviteGrantedPerms.length > 0 || inviteRevokedPerms.length > 0)
        ? { granted: inviteGrantedPerms, revoked: inviteRevokedPerms }
        : undefined,
    });

    const link = `https://pharmadesk.app/invite?token=${newInvite.token}`;
    setGeneratedInviteLink(link);

    // Reset fields
    setInviteName('');
    setInviteEmail('');
    setInvitePhone('');
    setInviteRole('pharmacist');
    setInviteBranches([store.branchName || 'Main Store']);
    setInviteGrantedPerms([]);
    setInviteRevokedPerms([]);
    setShowInvitePermOverrides(false);
  };

  const handleCopyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(id);
    setTimeout(() => setCopiedToken(null), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                Staff Management & RBAC
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                  Phase 4 Ready
                </span>
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Indian pharmacy staff directory, 72-hour invitation lifecycle, branch isolation, and granular permission overrides
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {isOwner && (
          <button
            onClick={() => {
              setGeneratedInviteLink(null);
              setIsInviteModalOpen(true);
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Invite Staff Member</span>
          </button>
        )}
      </div>

      {/* KPI Metrics Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Active Staff
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 flex items-baseline gap-2">
            {activeCount}
            <span className="text-xs font-normal text-slate-400">members</span>
          </div>
          <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 mt-1">
            <CheckCircle2 className="w-3 h-3" /> Valid branch memberships
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Pending Invitations
          </span>
          <div className="text-2xl font-bold font-mono text-blue-600 mt-1 flex items-baseline gap-2">
            {pendingInvitesCount}
            <span className="text-xs font-normal text-slate-400">pending</span>
          </div>
          <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
            <Clock className="w-3 h-3" /> 72-hour TTL security token
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Branch Isolation
          </span>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 flex items-baseline gap-2">
            {availableBranches.length}
            <span className="text-xs font-normal text-slate-400">counters</span>
          </div>
          <span className="text-[11px] text-indigo-600 font-medium flex items-center gap-1 mt-1">
            <Building2 className="w-3 h-3" /> Branch-scoped Firestore &amp; API rules
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
            Access Revoked
          </span>
          <div className="text-2xl font-bold font-mono text-red-600 mt-1 flex items-baseline gap-2">
            {deactivatedCount + suspendedCount}
            <span className="text-xs font-normal text-slate-400">restricted</span>
          </div>
          <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-1">
            <Ban className="w-3 h-3" /> Immediate token revocation
          </span>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab('employees')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'employees'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Active Staff Directory</span>
          <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-100 font-mono">
            {usersList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('invitations')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'invitations'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Pending Invitations</span>
          {pendingInvitesCount > 0 && (
            <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-700 font-mono font-semibold">
              {pendingInvitesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('matrix')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
            activeTab === 'matrix'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Role Permissions Matrix</span>
        </button>
      </div>

      {/* ================= TAB 1: EMPLOYEES DIRECTORY ================= */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search staff by name, email, phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Role filter */}
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Roles</option>
                <option value="owner">Owner</option>
                <option value="pharmacist">Pharmacist</option>
                <option value="cashier">Cashier</option>
                <option value="helper">Helper</option>
                <option value="auditor">Auditor</option>
              </select>

              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="deactivated">Deactivated</option>
              </select>
            </div>
          </div>

          {/* Employee Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map(emp => {
              const roleMeta = ROLE_INFO[emp.role] || ROLE_INFO.helper;
              const status = emp.status || 'active';
              const hasOverrides = (emp.permissionOverrides?.granted?.length || 0) > 0 || (emp.permissionOverrides?.revoked?.length || 0) > 0;

              return (
                <div
                  key={emp.id}
                  className={`bg-white rounded-2xl border transition-all p-5 flex flex-col justify-between shadow-xs ${
                    status === 'deactivated'
                      ? 'border-red-200 bg-red-50/20 opacity-75'
                      : status === 'suspended'
                      ? 'border-amber-200 bg-amber-50/20'
                      : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Top Row: Avatar & Status Badge */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm text-white shrink-0 ${
                            emp.role === 'owner'
                              ? 'bg-purple-600'
                              : emp.role === 'pharmacist'
                              ? 'bg-blue-600'
                              : emp.role === 'cashier'
                              ? 'bg-emerald-600'
                              : emp.role === 'auditor'
                              ? 'bg-slate-700'
                              : 'bg-amber-600'
                          }`}
                        >
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="text-sm font-bold text-slate-900 leading-tight">
                              {emp.name}
                            </h3>
                            {emp.id === currentUser.id && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold">
                                You
                              </span>
                            )}
                          </div>
                          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border mt-1 ${roleMeta.badgeColor}`}>
                            {roleMeta.title}
                          </span>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div>
                        {status === 'active' && (
                          <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                          </span>
                        )}
                        {status === 'suspended' && (
                          <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Suspended
                          </span>
                        )}
                        {status === 'deactivated' && (
                          <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Ban className="w-3 h-3" /> Revoked
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Contact details */}
                    <div className="space-y-1.5 text-xs text-slate-600 pt-1 border-t border-slate-100">
                      <div className="flex items-center gap-2 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{emp.phone || 'No phone recorded'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {emp.assignedBranchIds && emp.assignedBranchIds.length > 0
                            ? emp.assignedBranchIds.map(b => b.replace('branch-', '').replace('-', ' ')).join(', ')
                            : 'All Store Counters'}
                        </span>
                      </div>
                    </div>

                    {/* Permissions summary / overrides badge */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">
                        {emp.role === 'owner' ? (
                          <span className="text-purple-700 font-semibold flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Unrestricted Superuser (*)
                          </span>
                        ) : hasOverrides ? (
                          <span className="text-blue-700 font-medium flex items-center gap-1">
                            <Key className="w-3 h-3" />
                            +{emp.permissionOverrides?.granted?.length || 0} / -{emp.permissionOverrides?.revoked?.length || 0} Custom Overrides
                          </span>
                        ) : (
                          <span className="text-slate-400">Standard role permissions</span>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  {isOwner && (
                    <div className="pt-4 mt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEdit(emp)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 border border-slate-200 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Manage & Overrides</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredEmployees.length === 0 && (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-800">No staff members found</h3>
              <p className="text-xs text-slate-500 mt-1">Try adjusting your search query or role filter.</p>
            </div>
          )}
        </div>
      )}

      {/* ================= TAB 2: PENDING INVITATIONS ================= */}
      {activeTab === 'invitations' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <p className="font-semibold">PharmaDesk Secure 72-Hour Invitation Security Policy</p>
              <p className="mt-0.5 text-blue-700">
                Staff invitations generate a cryptographically random, tenant-isolated token with a strict 72-hour TTL.
                When the invitee signs in via Firebase Authentication, the token is verified and burned, binding their Firebase UID
                to the pharmacy membership and assigned branch access policies.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3">Invitee</th>
                    <th className="px-4 py-3">Role & Access</th>
                    <th className="px-4 py-3">Assigned Branches</th>
                    <th className="px-4 py-3">Status / Expiry</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invitationsList.map(inv => {
                    const roleMeta = ROLE_INFO[inv.role] || ROLE_INFO.helper;
                    const expiresAtDate = new Date(inv.expiresAt);
                    const now = new Date();
                    const hoursLeft = Math.round((expiresAtDate.getTime() - now.getTime()) / (1000 * 60 * 60));
                    const isExpired = hoursLeft <= 0 || inv.status === 'expired';
                    const inviteLink = `https://pharmadesk.app/invite?token=${inv.token}`;

                    return (
                      <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Invitee Info */}
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-900">{inv.name}</div>
                          <div className="text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{inv.email}</span>
                          </div>
                          {inv.phone && (
                            <div className="text-slate-400 text-[11px] flex items-center gap-1.5 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-300" />
                              <span>{inv.phone}</span>
                            </div>
                          )}
                        </td>

                        {/* Role */}
                        <td className="px-4 py-3.5">
                          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md border ${roleMeta.badgeColor}`}>
                            {roleMeta.title}
                          </span>
                          {(inv.permissionOverrides?.granted?.length || 0) > 0 && (
                            <div className="text-[10px] text-blue-600 font-medium mt-1">
                              +{inv.permissionOverrides?.granted?.length} custom overrides
                            </div>
                          )}
                        </td>

                        {/* Branches */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1">
                            {inv.assignedBranchIds.map(bId => (
                              <span
                                key={bId}
                                className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono"
                              >
                                {bId.replace('branch-', '').replace('-', ' ')}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Status / Expiry */}
                        <td className="px-4 py-3.5">
                          {inv.status === 'pending' && !isExpired && (
                            <div>
                              <span className="text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" /> Expires in {hoursLeft}h
                              </span>
                              <div className="text-[10px] text-slate-400 mt-1">
                                Sent: {new Date(inv.createdAt).toLocaleDateString('en-IN')}
                              </div>
                            </div>
                          )}
                          {inv.status === 'accepted' && (
                            <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Accepted & Active
                            </span>
                          )}
                          {(inv.status === 'expired' || (inv.status === 'pending' && isExpired)) && (
                            <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Expired (72h Exceeded)
                            </span>
                          )}
                          {inv.status === 'cancelled' && (
                            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Ban className="w-3 h-3" /> Cancelled
                            </span>
                          )}
                          {inv.status === 'revoked' && (
                            <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                              <Ban className="w-3 h-3" /> Revoked by Owner
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {inv.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => handleCopyLink(inviteLink, inv.id)}
                                  className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200 flex items-center gap-1 cursor-pointer"
                                  title="Copy Invite URL"
                                >
                                  {copiedToken === inv.id ? (
                                    <>
                                      <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      <span className="text-emerald-600 font-semibold">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copy Link</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => resendInvitation(inv.id)}
                                  className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                                  title="Resend Invitation (Resets 72h TTL)"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => cancelInvitation(inv.id)}
                                  className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                                  title="Cancel Invitation"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}

                            {inv.status !== 'pending' && (
                              <span className="text-[11px] text-slate-400 italic">No action required</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {invitationsList.length === 0 && (
              <div className="text-center py-10 p-6">
                <Mail className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-slate-800">No invitations found</h3>
                <p className="text-xs text-slate-500 mt-1">Send your first staff invitation using the button above.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: ROLE PERMISSIONS MATRIX ================= */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-1">
              PharmaDesk RBAC & Statutory Drug Compliance Matrix
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Default system privileges for Indian pharmacy operation roles under Drugs and Cosmetics Rules (Form 20B/21B).
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="px-4 py-3 min-w-[200px]">Permission Name & Domain</th>
                    <th className="px-3 py-3 text-center min-w-[90px]">Owner</th>
                    <th className="px-3 py-3 text-center min-w-[100px]">Pharmacist</th>
                    <th className="px-3 py-3 text-center min-w-[90px]">Cashier</th>
                    <th className="px-3 py-3 text-center min-w-[80px]">Helper</th>
                    <th className="px-3 py-3 text-center min-w-[80px]">Auditor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ALL_SYSTEM_PERMISSIONS.map(p => {
                    const pharmacistHas = DEFAULT_ROLE_PERMS.pharmacist.includes(p.key);
                    const cashierHas = DEFAULT_ROLE_PERMS.cashier.includes(p.key);
                    const helperHas = DEFAULT_ROLE_PERMS.helper.includes(p.key);
                    const auditorHas = DEFAULT_ROLE_PERMS.auditor.includes(p.key);

                    return (
                      <tr key={p.key} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-slate-900">{p.label}</div>
                          <div className="text-[11px] text-slate-400 font-mono">{p.key}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">{p.description}</div>
                        </td>

                        {/* Owner: Always has all */}
                        <td className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold">
                            ✓
                          </span>
                        </td>

                        {/* Pharmacist */}
                        <td className="px-3 py-2.5 text-center">
                          {pharmacistHas ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        {/* Cashier */}
                        <td className="px-3 py-2.5 text-center">
                          {cashierHas ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        {/* Helper */}
                        <td className="px-3 py-2.5 text-center">
                          {helperHas ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>

                        {/* Auditor */}
                        <td className="px-3 py-2.5 text-center">
                          {auditorHas ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold">
                              ✓
                            </span>
                          ) : (
                            <span className="text-slate-300 font-bold">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODAL: INVITE EMPLOYEE ================= */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Invite New Staff Member</h2>
                  <p className="text-xs text-slate-500">Sends a 72-hour invite link with RBAC assignments</p>
                </div>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* If link was just generated, show copy dialog */}
            {generatedInviteLink ? (
              <div className="py-6 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-bold text-emerald-800">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Invitation Link Generated Successfully!
                  </div>
                  <p className="text-xs text-emerald-700">
                    Share this secure URL with the employee. When they open it, they can register or log in with their
                    Firebase account to complete their onboarding into this pharmacy.
                  </p>
                </div>

                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <input
                    type="text"
                    readOnly
                    value={generatedInviteLink}
                    className="w-full text-xs font-mono bg-transparent text-slate-800 outline-none"
                  />
                  <button
                    onClick={() => handleCopyLink(generatedInviteLink, 'new-invite')}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shrink-0 flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedToken === 'new-invite' ? (
                      <>
                        <CheckCheck className="w-4 h-4" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" /> Copy
                      </>
                    )}
                  </button>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => {
                      setGeneratedInviteLink(null);
                      setIsInviteModalOpen(false);
                      setActiveTab('invitations');
                    }}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Done & View Pending List
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="space-y-4 pt-4">
                {/* Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Suresh Patel"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Email & Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="suresh@patelmedical.in"
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={invitePhone}
                      onChange={e => setInvitePhone(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Role Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Pharmacy Role <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(['pharmacist', 'cashier', 'helper', 'auditor', 'owner'] as UserRole[]).map(r => {
                      const meta = ROLE_INFO[r];
                      const isSelected = inviteRole === r;
                      return (
                        <div
                          key={r}
                          onClick={() => setInviteRole(r)}
                          className={`p-2.5 rounded-xl border cursor-pointer text-left transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                              : 'border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900 capitalize">{r}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                            {meta.title}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 italic">
                    {ROLE_INFO[inviteRole].legalContext}
                  </p>
                </div>

                {/* Branch Selection */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Assigned Store Branches & Counters
                  </label>
                  <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                    {availableBranches.map(branch => {
                      const isChecked = inviteBranches.includes(branch.id);
                      return (
                        <label
                          key={branch.id}
                          className="flex items-center gap-2.5 text-xs text-slate-800 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                if (inviteBranches.length > 1) {
                                  setInviteBranches(inviteBranches.filter(b => b !== branch.id));
                                }
                              } else {
                                setInviteBranches([...inviteBranches, branch.id]);
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium">{branch.name}</span>
                          <span className="text-[10px] font-mono text-slate-400">({branch.id})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Granular Permission Overrides Accordion */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setShowInvitePermOverrides(!showInvitePermOverrides)}
                    className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-500" />
                      Granular Permission Overrides (Optional)
                    </span>
                    {showInvitePermOverrides ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>

                  {showInvitePermOverrides && (
                    <div className="p-3 max-h-56 overflow-y-auto space-y-2 text-xs divide-y divide-slate-100">
                      <p className="text-[11px] text-slate-500 pb-1">
                        Select specific privileges to explicitly grant or revoke on top of their base role defaults:
                      </p>
                      {ALL_SYSTEM_PERMISSIONS.slice(0, 15).map(perm => {
                        const isGranted = inviteGrantedPerms.includes(perm.key);
                        const isRevoked = inviteRevokedPerms.includes(perm.key);

                        return (
                          <div key={perm.key} className="pt-2 flex items-center justify-between">
                            <div>
                              <div className="font-medium text-slate-800">{perm.label}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{perm.key}</div>
                            </div>
                            <div className="flex items-center gap-1 text-[11px]">
                              <button
                                type="button"
                                onClick={() => {
                                  if (isGranted) {
                                    setInviteGrantedPerms(inviteGrantedPerms.filter(k => k !== perm.key));
                                  } else {
                                    setInviteGrantedPerms([...inviteGrantedPerms, perm.key]);
                                    setInviteRevokedPerms(inviteRevokedPerms.filter(k => k !== perm.key));
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  isGranted ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                Grant +
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (isRevoked) {
                                    setInviteRevokedPerms(inviteRevokedPerms.filter(k => k !== perm.key));
                                  } else {
                                    setInviteRevokedPerms([...inviteRevokedPerms, perm.key]);
                                    setInviteGrantedPerms(inviteGrantedPerms.filter(k => k !== perm.key));
                                  }
                                }}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                                  isRevoked ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'
                                }`}
                              >
                                Revoke -
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Submit & Cancel Buttons */}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    Create & Generate 72h Invite
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= MODAL: EDIT EMPLOYEE & OVERRIDES ================= */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 my-8">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Manage {editingEmployee.name}
                  </h2>
                  <p className="text-xs text-slate-500">{editingEmployee.email}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingEmployee(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4 pt-4">
              {/* Role Change */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Change Role
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(['pharmacist', 'cashier', 'helper', 'auditor', 'owner'] as UserRole[]).map(r => {
                    const isSelected = editRole === r;
                    return (
                      <div
                        key={r}
                        onClick={() => setEditRole(r)}
                        className={`p-2.5 rounded-xl border cursor-pointer text-left transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900 capitalize">{r}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">
                          {ROLE_INFO[r].title}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Branch Assignment */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Pharmacy Branches
                </label>
                <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                  {availableBranches.map(branch => {
                    const isChecked = editBranches.includes(branch.id);
                    return (
                      <label
                        key={branch.id}
                        className="flex items-center gap-2.5 text-xs text-slate-800 cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              if (editBranches.length > 1) {
                                setEditBranches(editBranches.filter(b => b !== branch.id));
                              }
                            } else {
                              setEditBranches([...editBranches, branch.id]);
                            }
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="font-medium">{branch.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">({branch.id})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Permission Overrides */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowEditPermOverrides(!showEditPermOverrides)}
                  className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    Custom Permission Overrides ({editGrantedPerms.length} granted, {editRevokedPerms.length} revoked)
                  </span>
                  {showEditPermOverrides ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>

                {showEditPermOverrides && (
                  <div className="p-3 max-h-56 overflow-y-auto space-y-2 text-xs divide-y divide-slate-100">
                    {ALL_SYSTEM_PERMISSIONS.slice(0, 16).map(perm => {
                      const isGranted = editGrantedPerms.includes(perm.key);
                      const isRevoked = editRevokedPerms.includes(perm.key);

                      return (
                        <div key={perm.key} className="pt-2 flex items-center justify-between">
                          <div>
                            <div className="font-medium text-slate-800">{perm.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{perm.key}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (isGranted) {
                                  setEditGrantedPerms(editGrantedPerms.filter(k => k !== perm.key));
                                } else {
                                  setEditGrantedPerms([...editGrantedPerms, perm.key]);
                                  setEditRevokedPerms(editRevokedPerms.filter(k => k !== perm.key));
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                                isGranted ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-200'
                              }`}
                            >
                              Grant +
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (isRevoked) {
                                  setEditRevokedPerms(editRevokedPerms.filter(k => k !== perm.key));
                                } else {
                                  setEditRevokedPerms([...editRevokedPerms, perm.key]);
                                  setEditGrantedPerms(editGrantedPerms.filter(k => k !== perm.key));
                                }
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold border cursor-pointer ${
                                isRevoked ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200'
                              }`}
                            >
                              Revoke -
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status & Immediate Revocation Actions */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Account Access Status:</span>
                  <div className="flex items-center gap-1.5">
                    {editingEmployee.status !== 'active' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange('active')}
                        className="px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer"
                      >
                        Reactivate Account
                      </button>
                    )}
                    {editingEmployee.status !== 'suspended' && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange('suspended')}
                        className="px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer"
                      >
                        Suspend
                      </button>
                    )}
                    {editingEmployee.status !== 'deactivated' && (
                      <button
                        type="button"
                        onClick={() => setShowDeactivateConfirm(true)}
                        className="px-2.5 py-1 text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer flex items-center gap-1"
                      >
                        <Ban className="w-3.5 h-3.5" /> Deactivate Access
                      </button>
                    )}
                  </div>
                </div>

                {/* Immediate Revocation Confirmation Box */}
                {showDeactivateConfirm && (
                  <div className="mt-3 p-3.5 bg-red-50 border border-red-200 rounded-xl space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-red-900">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      Immediate Access Revocation Notice
                    </div>
                    <p className="text-[11px] text-red-800 leading-normal">
                      Deactivating this staff member will immediately reject all subsequent API calls and invalidate their active
                      session with a 403 Forbidden. They will not be able to bill, access medicines, or inspect customer records.
                    </p>
                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowDeactivateConfirm(false)}
                        className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange('deactivated')}
                        className="px-3 py-1 text-xs font-semibold bg-red-600 text-white hover:bg-red-700 rounded-lg shadow-xs"
                      >
                        Confirm Immediate Revocation
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit / Close */}
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
