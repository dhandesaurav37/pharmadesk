/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Edit3,
  GitBranch,
  History,
  Lock,
  Plus,
  Settings2,
  ShieldAlert,
  Star,
  UserCheck,
  X,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import type { BranchClosureCheck, BranchType, PharmacyBranch } from '../../types/pharmacy.ts';

const formatInr = (value: number): string =>
  `₹${(Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const BranchesView: React.FC = () => {
  const {
    branches,
    activeBranchId,
    switchActiveBranch,
    allInventory,
    stockTransfers,
    usersList,
    branchAuditLogs,
    hasUserPermission,
    createBranch,
    updateBranch,
    updateBranchSettings,
    setPrimaryBranch,
    changeBranchStatus,
    checkBranchClosure,
    closeBranch,
    assignEmployeeToBranch,
    removeEmployeeFromBranch,
  } = usePharmacy();

  const canView = hasUserPermission('branches.view');
  const canCreate = hasUserPermission('branches.create');
  const canUpdate = hasUserPermission('branches.update');
  const canManageSettings = hasUserPermission('branches.manage_settings');
  const canManageStaff = hasUserPermission('branches.manage_employees');
  const canSuspend = hasUserPermission('branches.suspend');
  const canDeactivate = hasUserPermission('branches.deactivate');
  const canActivate = hasUserPermission('branches.activate');
  const canClose = hasUserPermission('branches.close');

  const [tab, setTab] = useState<'directory' | 'audit'>('directory');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'CLOSED'>('ALL');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Create / Edit modal
  const [branchModalMode, setBranchModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingBranch, setEditingBranch] = useState<PharmacyBranch | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<BranchType>('RETAIL');
  const [formAddress, setFormAddress] = useState('');
  const [formCity, setFormCity] = useState('Mumbai');
  const [formState, setFormState] = useState('Maharashtra');
  const [formPincode, setFormPincode] = useState('400050');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formGstin, setFormGstin] = useState('');
  const [formDl20B, setFormDl20B] = useState('');
  const [formDl21B, setFormDl21B] = useState('');
  const [formHours, setFormHours] = useState('09:00 AM - 09:30 PM');
  const [formIsPrimary, setFormIsPrimary] = useState(false);

  // Settings / Transfer policy modal
  const [policyBranch, setPolicyBranch] = useState<PharmacyBranch | null>(null);
  const [polRequireApproval, setPolRequireApproval] = useState(true);
  const [polAllowSelfApproval, setPolAllowSelfApproval] = useState(false);
  const [polThresholdAmount, setPolThresholdAmount] = useState(5000);
  const [polThresholdQty, setPolThresholdQty] = useState(25);
  const [polHours, setPolHours] = useState('09:00 AM - 09:30 PM');

  // Staff assignment modal
  const [staffBranch, setStaffBranch] = useState<PharmacyBranch | null>(null);

  // Closure readiness modal
  const [closureBranch, setClosureBranch] = useState<PharmacyBranch | null>(null);
  const [closureCheck, setClosureCheck] = useState<BranchClosureCheck | null>(null);
  const [closureLoading, setClosureLoading] = useState(false);
  const [closureNotes, setClosureNotes] = useState('');

  // Status reason prompt modal
  const [statusTarget, setStatusTarget] = useState<{
    branch: PharmacyBranch;
    nextStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  } | null>(null);
  const [statusReason, setStatusReason] = useState('');

  const metricsByBranch = useMemo(() => {
    const map = new Map<string, { units: number; ptrValue: number; staffCount: number }>();
    for (const branch of branches) {
      const batches = allInventory.filter(b => (b.branchId || 'main') === branch.id);
      const units = batches.reduce((s, b) => s + b.currentStock, 0);
      const ptrValue = batches.reduce((s, b) => s + b.currentStock * (b.ptr || 0), 0);
      const staffCount = usersList.filter(
        u =>
          (u.status || 'active') === 'active' &&
          (u.role === 'owner' ||
            u.assignedBranchIds?.includes('*') ||
            u.assignedBranchIds?.includes(branch.id))
      ).length;
      map.set(branch.id, { units, ptrValue, staffCount });
    }
    return map;
  }, [branches, allInventory, usersList]);

  const filteredBranches = useMemo(() => {
    if (statusFilter === 'ALL') return branches;
    return branches.filter(b => b.status === statusFilter);
  }, [branches, statusFilter]);

  const activeCount = branches.filter(b => b.status === 'ACTIVE').length;
  const totalInTransitPtr = stockTransfers
    .filter(t => ['DISPATCHED', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(t.status))
    .reduce((s, t) => s + (t.inTransitValuationPtr || 0), 0);
  const primaryBranch = branches.find(b => b.isPrimary) || branches[0];

  if (!canView) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center max-w-xl mx-auto mt-10">
        <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-900">Branch Registry Restricted</h2>
        <p className="text-sm text-slate-600 mt-1">
          Viewing pharmacy branches and counters requires <span className="font-mono text-xs">branches.view</span> permission.
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    setEditingBranch(null);
    setBranchModalMode('create');
    setFormCode('');
    setFormName('');
    setFormType('RETAIL');
    setFormAddress('');
    setFormCity('Mumbai');
    setFormState('Maharashtra');
    setFormPincode('400050');
    setFormPhone('');
    setFormEmail('');
    setFormGstin(primaryBranch?.gstin || '');
    setFormDl20B('');
    setFormDl21B('');
    setFormHours('09:00 AM - 09:30 PM');
    setFormIsPrimary(false);
  };

  const openEditModal = (branch: PharmacyBranch) => {
    setEditingBranch(branch);
    setBranchModalMode('edit');
    setFormCode(branch.branchCode);
    setFormName(branch.name);
    setFormType(branch.branchType);
    setFormAddress(branch.address);
    setFormCity(branch.city);
    setFormState(branch.state);
    setFormPincode(branch.pincode);
    setFormPhone(branch.phone);
    setFormEmail(branch.email);
    setFormGstin(branch.gstin || '');
    setFormDl20B(branch.dlNumber20B || '');
    setFormDl21B(branch.dlNumber21B || '');
    setFormHours(branch.operatingHours || '09:00 AM - 09:30 PM');
    setFormIsPrimary(branch.isPrimary);
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (branchModalMode === 'create') {
      const res = await createBranch({
        branchCode: formCode,
        name: formName,
        branchType: formType,
        address: formAddress,
        city: formCity,
        state: formState,
        pincode: formPincode,
        phone: formPhone,
        email: formEmail,
        gstin: formGstin || null,
        dlNumber20B: formDl20B || null,
        dlNumber21B: formDl21B || null,
        operatingHours: formHours,
        isPrimary: formIsPrimary,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Failed to create branch' });
        return;
      }
      setBranchModalMode(null);
      setFeedback({ type: 'success', text: `Branch '${res.branch?.name}' created.` });
    } else if (branchModalMode === 'edit' && editingBranch) {
      const res = await updateBranch(editingBranch.id, {
        branchCode: formCode,
        name: formName,
        branchType: formType,
        address: formAddress,
        city: formCity,
        state: formState,
        pincode: formPincode,
        phone: formPhone,
        email: formEmail,
        gstin: formGstin || null,
        dlNumber20B: formDl20B || null,
        dlNumber21B: formDl21B || null,
        operatingHours: formHours,
      });
      if (!res.ok) {
        setFeedback({ type: 'error', text: res.error || 'Failed to update branch' });
        return;
      }
      setBranchModalMode(null);
      setFeedback({ type: 'success', text: `Updated branch '${formName}'.` });
    }
  };

  const openPolicyModal = (branch: PharmacyBranch) => {
    setPolicyBranch(branch);
    setPolRequireApproval(branch.transferPolicy.requireApproval);
    setPolAllowSelfApproval(branch.transferPolicy.allowSelfApproval);
    setPolThresholdAmount(branch.transferPolicy.approvalThresholdAmount);
    setPolThresholdQty(branch.transferPolicy.approvalThresholdQty);
    setPolHours(branch.operatingHours || '09:00 AM - 09:30 PM');
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!policyBranch) return;
    const res = await updateBranchSettings(policyBranch.id, {
      operatingHours: polHours,
      requireApproval: polRequireApproval,
      allowSelfApproval: polAllowSelfApproval,
      approvalThresholdAmount: Number(polThresholdAmount) || 0,
      approvalThresholdQty: Number(polThresholdQty) || 0,
    });
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Failed to save branch settings' });
      return;
    }
    setPolicyBranch(null);
    setFeedback({ type: 'success', text: `Transfer policy updated for ${policyBranch.branchCode}.` });
  };

  const openClosureModal = async (branch: PharmacyBranch) => {
    setClosureBranch(branch);
    setClosureNotes('');
    setClosureCheck(null);
    setClosureLoading(true);
    try {
      const result = await checkBranchClosure(branch.id);
      setClosureCheck(result);
    } finally {
      setClosureLoading(false);
    }
  };

  const handleConfirmClosure = async () => {
    if (!closureBranch) return;
    const res = await closeBranch(closureBranch.id, closureNotes);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Branch closure blocked' });
      return;
    }
    setClosureBranch(null);
    setFeedback({ type: 'success', text: `Branch '${closureBranch.name}' permanently closed.` });
  };

  const handleConfirmStatusChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTarget) return;
    const res = await changeBranchStatus(statusTarget.branch.id, statusTarget.nextStatus, statusReason);
    if (!res.ok) {
      setFeedback({ type: 'error', text: res.error || 'Status transition rejected' });
      return;
    }
    setStatusTarget(null);
    setStatusReason('');
    setFeedback({
      type: 'success',
      text: `Branch '${statusTarget.branch.branchCode}' transitioned to ${statusTarget.nextStatus}.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Branches &amp; Counter Locations</h1>
          <p className="text-xs text-slate-600 mt-1">
            Manage retail counters, OPD clinic dispensaries, drug licenses, staff assignments, and controlled branch closure.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Add Branch</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-medium flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">Total Branches</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">{branches.length}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Registered tenant locations</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">Active Operational</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">{activeCount}</div>
          <span className="text-[11px] text-slate-500 mt-1 block">Open for POS &amp; stock inward</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">In-Transit Stock (GL 1450)</span>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
            {formatInr(totalInTransitPtr)}
          </div>
          <span className="text-[11px] text-slate-500 mt-1 block">Pending destination receipt</span>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <span className="text-xs font-semibold text-slate-500">Primary Store</span>
          <div className="text-base font-bold text-slate-900 mt-1 truncate">
            {primaryBranch?.name || 'Main Store'}
          </div>
          <span className="text-[11px] font-mono text-slate-500 mt-1 block">
            Code: {primaryBranch?.branchCode || 'MAIN'}
          </span>
        </div>
      </div>

      {/* Tabs + Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => setTab('directory')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'directory' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Branch Directory</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('audit')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap flex items-center gap-1.5 ${
              tab === 'audit' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Lifecycle Audit Log ({branchAuditLogs.length})</span>
          </button>
        </div>

        {tab === 'directory' && (
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
            {(['ALL', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'CLOSED'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  statusFilter === s ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'ALL' ? 'All' : s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Directory Table */}
      {tab === 'directory' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Licenses &amp; Hours</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Stock Units</th>
                  <th className="px-4 py-3 text-right">PTR Value (₹)</th>
                  <th className="px-4 py-3 text-center">Staff</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBranches.map(branch => {
                  const stats = metricsByBranch.get(branch.id) || { units: 0, ptrValue: 0, staffCount: 0 };
                  const isActiveWorkspace = activeBranchId === branch.id;
                  return (
                    <tr key={branch.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{branch.name}</span>
                              {branch.isPrimary && (
                                <span className="text-[11px] font-medium text-blue-700">· Primary</span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              <span className="font-mono font-semibold text-slate-700">{branch.branchCode}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{branch.branchType}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{branch.city}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600">
                        <div className="font-mono">20B: {branch.dlNumber20B || 'Inherited'}</div>
                        <div className="text-slate-500 mt-0.5">{branch.operatingHours || 'Standard Hours'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`font-semibold text-xs ${
                            branch.status === 'ACTIVE'
                              ? 'text-emerald-700'
                              : branch.status === 'SUSPENDED'
                              ? 'text-amber-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {branch.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                        {stats.units}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-800">
                        {formatInr(stats.ptrValue)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono tabular-nums text-slate-700">
                        {stats.staffCount}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => switchActiveBranch(branch.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
                              isActiveWorkspace
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {isActiveWorkspace ? 'Active' : 'Switch'}
                          </button>

                          {canUpdate && branch.status !== 'CLOSED' && (
                            <button
                              type="button"
                              onClick={() => openEditModal(branch)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200"
                              title="Edit Branch"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManageSettings && branch.status !== 'CLOSED' && (
                            <button
                              type="button"
                              onClick={() => openPolicyModal(branch)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200"
                              title="Transfer Policy & Hours"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManageStaff && (
                            <button
                              type="button"
                              onClick={() => setStaffBranch(branch)}
                              className="p-1.5 rounded-md text-slate-600 hover:text-indigo-700 hover:bg-indigo-50 border border-slate-200"
                              title="Assign Staff"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canUpdate && !branch.isPrimary && branch.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const res = await setPrimaryBranch(branch.id);
                                if (!res.ok) setFeedback({ type: 'error', text: res.error || 'Error' });
                                else setFeedback({ type: 'success', text: `${branch.branchCode} promoted to Primary.` });
                              }}
                              className="p-1.5 rounded-md text-slate-600 hover:text-amber-700 hover:bg-amber-50 border border-slate-200"
                              title="Set Primary Branch"
                            >
                              <Star className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {branch.status === 'ACTIVE' && (canSuspend || canDeactivate) && !branch.isPrimary && (
                            <button
                              type="button"
                              onClick={() => {
                                setStatusTarget({ branch, nextStatus: canSuspend ? 'SUSPENDED' : 'INACTIVE' });
                                setStatusReason('');
                              }}
                              className="px-2 py-1 rounded-md text-[11px] font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 whitespace-nowrap"
                            >
                              Suspend
                            </button>
                          )}

                          {(branch.status === 'SUSPENDED' || branch.status === 'INACTIVE') && canActivate && (
                            <button
                              type="button"
                              onClick={() => {
                                setStatusTarget({ branch, nextStatus: 'ACTIVE' });
                                setStatusReason('');
                              }}
                              className="px-2 py-1 rounded-md text-[11px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 whitespace-nowrap"
                            >
                              Activate
                            </button>
                          )}

                          {canClose && branch.status !== 'CLOSED' && !branch.isPrimary && (
                            <button
                              type="button"
                              onClick={() => void openClosureModal(branch)}
                              className="px-2 py-1 rounded-md text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 whitespace-nowrap flex items-center gap-1"
                            >
                              <Lock className="w-3 h-3" />
                              <span>Close</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredBranches.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No branches match the selected status filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lifecycle Audit Log */}
      {tab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Branch</th>
                <th className="px-4 py-2.5">Action</th>
                <th className="px-4 py-2.5">Transition</th>
                <th className="px-4 py-2.5">Reason / Notes</th>
                <th className="px-4 py-2.5">Performed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {branchAuditLogs.map(log => (
                <tr key={log.id}>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
                    {log.timestamp.slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">
                    {log.branchCode} · {log.branchName}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-800">{log.action}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {log.previousStatus && log.newStatus ? `${log.previousStatus} → ${log.newStatus}` : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{log.reason || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-700">{log.performedBy}</td>
                </tr>
              ))}
              {branchAuditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No branch lifecycle changes recorded in this session yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Branch Modal */}
      {branchModalMode && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {branchModalMode === 'create' ? 'Create New Pharmacy Branch' : `Edit Branch · ${editingBranch?.branchCode}`}
              </h2>
              <button
                type="button"
                onClick={() => setBranchModalMode(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveBranch} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch Code *</label>
                  <input
                    required
                    value={formCode}
                    onChange={e => setFormCode(e.target.value.toUpperCase())}
                    placeholder="OPD2"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono uppercase"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Branch Name *</label>
                  <input
                    required
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="OPD Pharmacy Counter (Dadar)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch Type</label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as BranchType)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="MAIN">MAIN</option>
                    <option value="RETAIL">RETAIL</option>
                    <option value="CLINIC">CLINIC</option>
                    <option value="HOSPITAL_COUNTER">HOSPITAL_COUNTER</option>
                    <option value="WAREHOUSE">WAREHOUSE</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Operating Hours</label>
                  <input
                    value={formHours}
                    onChange={e => setFormHours(e.target.value)}
                    placeholder="09:00 AM - 09:30 PM"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Street Address *</label>
                <input
                  required
                  value={formAddress}
                  onChange={e => setFormAddress(e.target.value)}
                  placeholder="Shop No. 2, Station Road"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">City</label>
                  <input
                    value={formCity}
                    onChange={e => setFormCity(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">State</label>
                  <input
                    value={formState}
                    onChange={e => setFormState(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pincode</label>
                  <input
                    value={formPincode}
                    onChange={e => setFormPincode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Branch GSTIN</label>
                  <input
                    value={formGstin}
                    onChange={e => setFormGstin(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">DL Form 20B</label>
                  <input
                    value={formDl20B}
                    onChange={e => setFormDl20B(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">DL Form 21B</label>
                  <input
                    value={formDl21B}
                    onChange={e => setFormDl21B(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              {branchModalMode === 'create' && (
                <label className="flex items-center gap-2 text-slate-700 font-medium pt-1">
                  <input
                    type="checkbox"
                    checked={formIsPrimary}
                    onChange={e => setFormIsPrimary(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  <span>Promote as Primary Store immediately</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setBranchModalMode(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
                >
                  {branchModalMode === 'create' ? 'Create Branch' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Policy & Settings Modal */}
      {policyBranch && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Transfer Policy &amp; Settings · {policyBranch.branchCode}
              </h2>
              <button type="button" onClick={() => setPolicyBranch(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSavePolicy} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Operating Hours</label>
                <input
                  value={polHours}
                  onChange={e => setPolHours(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={polRequireApproval}
                  onChange={e => setPolRequireApproval(e.target.checked)}
                />
                <span>Require approval before dispatch when threshold is met</span>
              </label>
              <label className="flex items-center gap-2 text-slate-800 font-medium">
                <input
                  type="checkbox"
                  checked={polAllowSelfApproval}
                  onChange={e => setPolAllowSelfApproval(e.target.checked)}
                />
                <span>Allow requester to self-approve stock transfers</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Auto-Approve Below PTR (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={polThresholdAmount}
                    onChange={e => setPolThresholdAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Auto-Approve Below Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={polThresholdQty}
                    onChange={e => setPolThresholdQty(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPolicyBranch(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold">
                  Save Policy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Assignment Modal */}
      {staffBranch && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Staff Access · {staffBranch.name} ({staffBranch.branchCode})
              </h2>
              <button type="button" onClick={() => setStaffBranch(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 divide-y divide-slate-100 text-xs">
              {usersList.map(user => {
                const isWildcard = user.role === 'owner' || user.assignedBranchIds?.includes('*');
                const isAssigned = isWildcard || Boolean(user.assignedBranchIds?.includes(staffBranch.id));
                return (
                  <div key={user.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{user.name}</div>
                      <div className="text-[11px] text-slate-500 capitalize">
                        {user.role} · {user.email}
                      </div>
                    </div>
                    {isWildcard ? (
                      <span className="text-[11px] font-medium text-slate-500">All Branches (Owner)</span>
                    ) : isAssigned ? (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await removeEmployeeFromBranch(staffBranch.id, user.id);
                          if (!res.ok) setFeedback({ type: 'error', text: res.error || 'Error' });
                        }}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100"
                      >
                        Unassign
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await assignEmployeeToBranch(staffBranch.id, user.id);
                          if (!res.ok) setFeedback({ type: 'error', text: res.error || 'Error' });
                        }}
                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100"
                      >
                        Assign
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Status Transition Modal */}
      {statusTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Set {statusTarget.branch.branchCode} to {statusTarget.nextStatus}
              </h2>
              <button type="button" onClick={() => setStatusTarget(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmStatusChange} className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                {statusTarget.nextStatus === 'ACTIVE'
                  ? 'Activating this branch restores POS billing, stock inward, and outgoing/incoming transfers.'
                  : 'Suspending or deactivating this branch locks mutating operations while preserving historical reports and audit trails.'}
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Audit Reason</label>
                <input
                  value={statusReason}
                  onChange={e => setStatusReason(e.target.value)}
                  placeholder="Renovation / DL renewal / seasonal pause"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusTarget(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold"
                >
                  Confirm {statusTarget.nextStatus}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Controlled Branch Closure Modal */}
      {closureBranch && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                Controlled Branch Closure · {closureBranch.branchCode}
              </h2>
              <button type="button" onClick={() => setClosureBranch(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              {closureLoading || !closureCheck ? (
                <div className="py-6 text-center text-slate-500">Scanning open transfers, stock, POs, receivables, and payables...</div>
              ) : (
                <>
                  <div
                    className={`rounded-lg border p-3.5 ${
                      closureCheck.eligible
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-rose-50 border-rose-200 text-rose-900'
                    }`}
                  >
                    <div className="font-bold flex items-center gap-1.5">
                      {closureCheck.eligible ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          <span>All Closure Preconditions Passed</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-4 h-4 text-rose-700" />
                          <span>Closure Blocked ({closureCheck.blockers.length} issue(s) remaining)</span>
                        </>
                      )}
                    </div>
                    {!closureCheck.eligible && (
                      <ul className="mt-2 space-y-1 list-disc list-inside">
                        {closureCheck.blockers.map((b, idx) => (
                          <li key={idx}>{b}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-[11px]">
                    <div className="border border-slate-200 rounded-lg p-2.5 flex justify-between">
                      <span className="text-slate-500">Pending Transfers</span>
                      <span className="font-mono font-bold">{closureCheck.metrics.pendingStockTransfers}</span>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-2.5 flex justify-between">
                      <span className="text-slate-500">Remaining Stock</span>
                      <span className="font-mono font-bold">{closureCheck.metrics.remainingStockUnits} units</span>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-2.5 flex justify-between">
                      <span className="text-slate-500">Open POs / GRNs</span>
                      <span className="font-mono font-bold">
                        {closureCheck.metrics.openPurchaseOrders + closureCheck.metrics.draftGrns}
                      </span>
                    </div>
                    <div className="border border-slate-200 rounded-lg p-2.5 flex justify-between">
                      <span className="text-slate-500">Open Receivables / Payables</span>
                      <span className="font-mono font-bold">
                        {closureCheck.metrics.openSalesInvoicesReceivable + closureCheck.metrics.openSupplierInvoicesPayable}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Closure Audit Notes</label>
                    <textarea
                      rows={2}
                      value={closureNotes}
                      onChange={e => setClosureNotes(e.target.value)}
                      placeholder="Lease ended, stock transferred to Main Store..."
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setClosureBranch(null)}
                      className="px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!closureCheck.eligible}
                      onClick={() => void handleConfirmClosure()}
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg font-semibold"
                    >
                      Close Branch Permanently
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
