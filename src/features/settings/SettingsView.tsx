/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Printer,
  ShieldCheck,
  CheckCircle2,
  Save,
  Server,
  ShieldAlert,
  Download,
  RefreshCw,
  FileSearch,
  HardDriveDownload,
  Lock,
  AlertTriangle,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { PharmacyStore } from '../../types/pharmacy.ts';
import {
  DpdpExportManifestData,
  DrDrillData,
  RetentionPolicyData,
  securityApi,
  SecurityAuditLogRecord,
  SecurityPostureData,
} from '../../lib/securityApi.ts';

type SettingsTab = 'store' | 'billing' | 'roles' | 'security' | 'architecture';

export const SettingsView: React.FC = () => {
  const { store, updateStore, currentUser, apiSession, branchAuditLogs } = usePharmacy();
  const isOwner = currentUser.role === 'owner';

  const [activeTab, setActiveTab] = useState<SettingsTab>(isOwner ? 'store' : 'security');
  const [formData, setFormData] = useState<PharmacyStore>(store);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Phase 11 Security, Audit, DPDP & DR State
  const [posture, setPosture] = useState<SecurityPostureData | null>(null);
  const [liveAuditLogs, setLiveAuditLogs] = useState<SecurityAuditLogRecord[]>([]);
  const [dpdpExports, setDpdpExports] = useState<DpdpExportManifestData[]>([]);
  const [drDrills, setDrDrills] = useState<DrDrillData[]>([]);
  const [retentionForm, setRetentionForm] = useState<RetentionPolicyData>({
    tenantId: apiSession.tenantId || 'preview-tenant',
    taxInvoiceYears: 6,
    prescriptionYears: 3,
    auditLogDays: 365,
    supplierRecordYears: 6,
    dpdpExportTtlMinutes: 15,
    legalHoldEnabled: false,
    notes: 'Default statutory baseline aligned with GST (6 yrs), Drugs & Cosmetics Rules (3 yrs), and DPDP Act 2023.',
    updatedAt: new Date().toISOString(),
    updatedBy: 'system-default',
  });
  const [auditSearch, setAuditSearch] = useState('');
  const [dpdpReason, setDpdpReason] = useState('Statutory audit & DPDP portability verification');
  const [dpdpIncludePhi, setDpdpIncludePhi] = useState(false);
  const [drillNotes, setDrillNotes] = useState('');
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityBanner, setSecurityBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!isOwner && (activeTab === 'store' || activeTab === 'billing')) {
      setActiveTab('security');
    }
  }, [isOwner, activeTab]);

  const loadSecurityConsole = async () => {
    if (!apiSession.bearerToken) {
      setPosture({
        tenantId: apiSession.tenantId || 'demo-pharmacy',
        region: 'asia-south1',
        environment: 'preview',
        controls: {
          appCheckRequired: false,
          corsWildcardBlockedInProd: true,
          corsAllowedOriginsCount: 2,
          helmetHeadersEnabled: true,
          apiNoStoreCacheHeaders: true,
          trustProxySetting: '1 (Cloud Run)',
          pinoPhiRedactionEnabled: true,
          csvFormulaNeutralizationEnabled: true,
          storageSvgUploadBlocked: true,
          branchMembershipScopingEnforced: true,
          idempotencySha256Enabled: true,
          sensitiveRateLimiterActive: true,
        },
        dpdp: {
          retentionPolicy: retentionForm,
          recentExportsCount: dpdpExports.length,
          lastExportAt: dpdpExports[0]?.createdAt || null,
        },
        disasterRecovery: {
          rpoTargetMinutes: 5,
          rtoTargetMinutes: 30,
          backupBucketName: 'gs://pharmadesk-cloud-firestore-backups/asia-south1',
          lastDrill: drDrills[0] || null,
          pitrStagingNote:
            'Preview mode active (no live Firebase Auth session). Connect a signed-in Firebase token to execute live /api/v1/security endpoints.',
        },
        generatedAt: new Date().toISOString(),
      });
      setLiveAuditLogs(
        branchAuditLogs.slice(0, 30).map((l) => ({
          id: l.id,
          tenantId: apiSession.tenantId || 'demo-pharmacy',
          branchId: l.branchId,
          actingUserId: l.performedBy,
          action: l.action,
          metadata: { entityType: l.entityType, entityId: l.entityId },
          timestamp: l.createdAt,
        }))
      );
      return;
    }

    setSecurityLoading(true);
    setSecurityBanner(null);
    try {
      const [postureRes, logsRes, exportsRes, drRes] = await Promise.all([
        securityApi.getPosture(apiSession),
        securityApi.queryAuditLogs(apiSession, { search: auditSearch, limit: 50 }),
        securityApi.listDpdpExports(apiSession),
        securityApi.getDrStatus(apiSession),
      ]);
      setPosture(postureRes);
      setRetentionForm(postureRes.dpdp.retentionPolicy);
      setLiveAuditLogs(logsRes);
      setDpdpExports(exportsRes);
      setDrDrills(drRes.drills);
    } catch (err: any) {
      setSecurityBanner({
        type: 'error',
        text: err?.detail || err?.message || 'Unable to load Phase 11 security posture.',
      });
    } finally {
      setSecurityLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      void loadSecurityConsole();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, apiSession.bearerToken, apiSession.tenantId, apiSession.branchId]);

  const handleFieldChange = (key: keyof PharmacyStore, val: any) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateStore(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  const handleSaveRetention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;
    if (!apiSession.bearerToken) {
      setSecurityBanner({
        type: 'success',
        text: 'Preview mode: Retention policy values updated locally for inspection. Sign in to persist to Cloud Firestore.',
      });
      return;
    }
    setSecurityLoading(true);
    setSecurityBanner(null);
    try {
      const updated = await securityApi.updateRetentionPolicy(apiSession, {
        taxInvoiceYears: retentionForm.taxInvoiceYears,
        prescriptionYears: retentionForm.prescriptionYears,
        auditLogDays: retentionForm.auditLogDays,
        supplierRecordYears: retentionForm.supplierRecordYears,
        dpdpExportTtlMinutes: retentionForm.dpdpExportTtlMinutes,
        legalHoldEnabled: retentionForm.legalHoldEnabled,
        notes: retentionForm.notes,
      });
      setRetentionForm(updated);
      setSecurityBanner({
        type: 'success',
        text: 'Statutory data retention policy persisted to Cloud Firestore and audit logged.',
      });
      await loadSecurityConsole();
    } catch (err: any) {
      setSecurityBanner({
        type: 'error',
        text: err?.detail || err?.message || 'Failed to update retention policy.',
      });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleDpdpExport = async () => {
    if (!isOwner) return;
    if (!apiSession.bearerToken) {
      setSecurityBanner({
        type: 'error',
        text: 'Firebase Authentication is required to generate an audited DPDP tenant export bundle.',
      });
      return;
    }
    setSecurityLoading(true);
    setSecurityBanner(null);
    try {
      const res = await securityApi.generateDpdpExport(apiSession, {
        reason: dpdpReason,
        includeClinicalPhi: dpdpIncludePhi,
      });
      const blob = new Blob([JSON.stringify(res.bundle, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pharmadesk-dpdp-export-${res.manifest.tenantId}-${res.manifest.id}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSecurityBanner({
        type: 'success',
        text: `DPDP export ${res.manifest.id} downloaded (SHA-256: ${res.manifest.checksumSha256.slice(0, 12)}…).`,
      });
      await loadSecurityConsole();
    } catch (err: any) {
      setSecurityBanner({
        type: 'error',
        text: err?.detail || err?.message || 'Failed to generate DPDP export.',
      });
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleRunDrDrill = async () => {
    if (!isOwner) return;
    if (!apiSession.bearerToken) {
      setSecurityBanner({
        type: 'error',
        text: 'Firebase Authentication is required to execute and persist a live DR verification drill.',
      });
      return;
    }
    setSecurityLoading(true);
    setSecurityBanner(null);
    try {
      const drill = await securityApi.recordDrDrill(apiSession, {
        drillType: 'INTEGRITY_CHECK',
        notes: drillNotes || undefined,
      });
      setDrillNotes('');
      setSecurityBanner({
        type: drill.status === 'PASSED' ? 'success' : 'error',
        text: `DR verification drill ${drill.id} completed (${drill.status}). Unbalanced journals: ${drill.integritySummary.unbalancedJournals}.`,
      });
      await loadSecurityConsole();
    } catch (err: any) {
      setSecurityBanner({
        type: 'error',
        text: err?.detail || err?.message || 'Failed to record DR verification drill.',
      });
    } finally {
      setSecurityLoading(false);
    }
  };

  const filteredAuditLogs = liveAuditLogs.filter((entry) => {
    if (!auditSearch.trim()) return true;
    const q = auditSearch.trim().toLowerCase();
    return (
      entry.action.toLowerCase().includes(q) ||
      entry.actingUserId.toLowerCase().includes(q) ||
      JSON.stringify(entry.metadata || {}).toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Pharmacy Security & Store Settings
            </h1>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-md font-mono">
              {isOwner ? 'Owner Configuration' : 'Auditor Read-Only'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Store identity, drug licensing, DPDP privacy governance, audit trails & disaster recovery readiness
          </p>
        </div>

        {savedSuccess && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-lg">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Settings saved</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-semibold overflow-x-auto">
        {isOwner && (
          <>
            <button
              onClick={() => setActiveTab('store')}
              className={`pb-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === 'store'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>Pharmacy & Licenses</span>
            </button>

            <button
              onClick={() => setActiveTab('billing')}
              className={`pb-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
                activeTab === 'billing'
                  ? 'border-blue-600 text-blue-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Printer className="w-4 h-4" />
              <span>Receipt & Billing</span>
            </button>
          </>
        )}

        <button
          onClick={() => setActiveTab('security')}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'security'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Security, Audit & DR</span>
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'roles'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Role Permissions</span>
        </button>

        <button
          onClick={() => setActiveTab('architecture')}
          className={`pb-3 px-3 border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
            activeTab === 'architecture'
              ? 'border-blue-600 text-blue-700 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Backend & Cloud Architecture</span>
        </button>
      </div>

      {/* Tab 1: Pharmacy Profile & Licenses */}
      {activeTab === 'store' && isOwner && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pharmacy Trade Name *
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => handleFieldChange('name', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Branch Name *
              </label>
              <input
                type="text"
                required
                value={formData.branchName}
                onChange={e => handleFieldChange('branchName', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Shop Address *
            </label>
            <input
              type="text"
              required
              value={formData.address}
              onChange={e => handleFieldChange('address', e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => handleFieldChange('city', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
              <input
                type="text"
                value={formData.state}
                onChange={e => handleFieldChange('state', e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">PIN Code</label>
              <input
                type="text"
                value={formData.pincode}
                onChange={e => handleFieldChange('pincode', e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Statutory Drug Licenses & GSTIN
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Drug License Form 20B (Retail Allopathic) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.dlNumber20B}
                  onChange={e => handleFieldChange('dlNumber20B', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Drug License Form 21B (Retail Specific Drugs) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.dlNumber21B}
                  onChange={e => handleFieldChange('dlNumber21B', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  GSTIN (Goods and Services Tax Identification Number) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.gstin}
                  onChange={e => handleFieldChange('gstin', e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  FSSAI Food License Number
                </label>
                <input
                  type="text"
                  value={formData.fssaiNumber}
                  onChange={e => handleFieldChange('fssaiNumber', e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Pharmacy Profile</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 2: Billing & Receipt Setup */}
      {activeTab === 'billing' && isOwner && (
        <form onSubmit={handleSave} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Invoice Series Prefix *
              </label>
              <input
                type="text"
                required
                value={formData.invoicePrefix}
                onChange={e => handleFieldChange('invoicePrefix', e.target.value.toUpperCase())}
                className="w-full px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Resulting format: {formData.invoicePrefix || 'INV'}-2026-1049
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Default Patient Discount (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={formData.defaultDiscountPercent}
                onChange={e => handleFieldChange('defaultDiscountPercent', Number(e.target.value))}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
              <span className="text-[11px] text-slate-400 mt-1 block">
                Auto-applied on standard prescriptions
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Default Printer Hardware & Invoice Output
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-colors ${
                  formData.thermalPrinter
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="printerSetting"
                  checked={formData.thermalPrinter}
                  onChange={() => handleFieldChange('thermalPrinter', true)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    80mm Thermal Receipt (3-inch roll)
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    High-speed point-of-sale receipt for walk-in retail counters.
                  </span>
                </div>
              </label>

              <label
                className={`p-4 border rounded-xl cursor-pointer flex items-start gap-3 transition-colors ${
                  !formData.thermalPrinter
                    ? 'border-blue-600 bg-blue-50/50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="printerSetting"
                  checked={!formData.thermalPrinter}
                  onChange={() => handleFieldChange('thermalPrinter', false)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900 block">
                    Standard A4 / A5 Tax Invoice
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Detailed GST breakdown with duplicate buyer and seller copies.
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Billing Preferences</span>
            </button>
          </div>
        </form>
      )}

      {/* Tab 3 (Phase 11): Security, Audit Logs, DPDP & Disaster Recovery */}
      {activeTab === 'security' && (
        <div className="space-y-5">
          {!apiSession.bearerToken && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Local Preview Mode:</span> No Firebase Auth bearer token is attached to this session. Security control flags show default hardened baseline; connect a signed-in Firebase session to run live <span className="font-mono">/api/v1/security/*</span> DPDP exports and DR drills.
              </div>
            </div>
          )}

          {securityBanner && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                securityBanner.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {securityBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 shrink-0" />
              )}
              <span>{securityBanner.text}</span>
            </div>
          )}

          {/* Security Posture Matrix */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Phase 11 Security Hardening Posture
                </h3>
                <p className="text-xs text-slate-500">
                  Runtime controls enforced across Express API, Cloud Firestore, and Firebase Storage ({posture?.region || 'asia-south1'})
                </p>
              </div>
              <button
                type="button"
                onClick={loadSecurityConsole}
                disabled={securityLoading}
                className="px-3 py-1.5 text-xs font-semibold border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${securityLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="text-[11px] font-semibold text-slate-500 block">App Check Enforcement</span>
                <span className="font-bold text-slate-900 block mt-1">
                  {posture?.controls.appCheckRequired ? 'Strict Enforced' : 'Configurable (Staging Ready)'}
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="text-[11px] font-semibold text-slate-500 block">HTTP Security & Cache</span>
                <span className="font-bold text-emerald-700 block mt-1">
                  Helmet DENY + no-store API
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="text-[11px] font-semibold text-slate-500 block">Storage & CSV Hygiene</span>
                <span className="font-bold text-emerald-700 block mt-1">
                  SVG Blocked · CSV Formula Guard
                </span>
              </div>
              <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70">
                <span className="text-[11px] font-semibold text-slate-500 block">Log & Branch Isolation</span>
                <span className="font-bold text-emerald-700 block mt-1">
                  Pino PHI Redaction · Branch Checks
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Statutory Retention Policy & DPDP Export */}
            <form onSubmit={handleSaveRetention} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  DPDP Act 2023 Retention & Data Portability
                </h3>
                <p className="text-xs text-slate-500">
                  Statutory archival windows and audited tenant data export
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tax Invoices (Years)</label>
                  <input
                    type="number"
                    min={6}
                    max={10}
                    disabled={!isOwner}
                    value={retentionForm.taxInvoiceYears}
                    onChange={e => setRetentionForm(prev => ({ ...prev, taxInvoiceYears: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Prescriptions (Years)</label>
                  <input
                    type="number"
                    min={3}
                    max={10}
                    disabled={!isOwner}
                    value={retentionForm.prescriptionYears}
                    onChange={e => setRetentionForm(prev => ({ ...prev, prescriptionYears: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Audit Logs (Days)</label>
                  <input
                    type="number"
                    min={365}
                    max={3650}
                    disabled={!isOwner}
                    value={retentionForm.auditLogDays}
                    onChange={e => setRetentionForm(prev => ({ ...prev, auditLogDays: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">DPDP Export TTL (Min)</label>
                  <input
                    type="number"
                    min={5}
                    max={60}
                    disabled={!isOwner}
                    value={retentionForm.dpdpExportTtlMinutes}
                    onChange={e => setRetentionForm(prev => ({ ...prev, dpdpExportTtlMinutes: Number(e.target.value) }))}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg font-mono disabled:bg-slate-50"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  disabled={!isOwner}
                  checked={retentionForm.legalHoldEnabled}
                  onChange={e => setRetentionForm(prev => ({ ...prev, legalHoldEnabled: e.target.checked }))}
                />
                <span>Enable statutory legal hold (blocks archival purging during tax/CDSCO inspection)</span>
              </label>

              {isOwner && (
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={securityLoading}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Retention Policy</span>
                  </button>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 space-y-2.5 text-xs">
                <div className="font-bold text-slate-800">DPDP Tenant Portability Export</div>
                <input
                  type="text"
                  disabled={!isOwner}
                  value={dpdpReason}
                  onChange={e => setDpdpReason(e.target.value)}
                  placeholder="Mandatory audit reason (min 5 chars)"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-slate-600">
                    <input
                      type="checkbox"
                      disabled={!isOwner}
                      checked={dpdpIncludePhi}
                      onChange={e => setDpdpIncludePhi(e.target.checked)}
                    />
                    <span>Include patient clinical fields (audited)</span>
                  </label>
                  {isOwner && (
                    <button
                      type="button"
                      disabled={securityLoading || dpdpReason.trim().length < 5}
                      onClick={handleDpdpExport}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Export JSON</span>
                    </button>
                  )}
                </div>
                {dpdpExports.length > 0 && (
                  <div className="text-[11px] text-slate-500">
                    Latest export: <span className="font-mono text-slate-700">{dpdpExports[0].id}</span> · SHA-256:{' '}
                    <span className="font-mono">{dpdpExports[0].checksumSha256.slice(0, 14)}…</span>
                  </div>
                )}
              </div>
            </form>

            {/* Disaster Recovery & Backup Verification */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Backup & Disaster Recovery Readiness (asia-south1)
                </h3>
                <p className="text-xs text-slate-500">
                  Targets, ledger parity verification drills, and Firestore PITR status
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] text-slate-500 block">Target RPO</span>
                  <span className="text-sm font-bold text-slate-900">
                    &lt; {posture?.disasterRecovery.rpoTargetMinutes || 5} mins
                  </span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] text-slate-500 block">Target RTO</span>
                  <span className="text-sm font-bold text-slate-900">
                    &lt; {posture?.disasterRecovery.rtoTargetMinutes || 30} mins
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 space-y-1">
                <div>
                  <span className="font-semibold text-slate-800">Backup Bucket:</span>{' '}
                  <span className="font-mono">{posture?.disasterRecovery.backupBucketName || 'gs://pharmadesk-cloud-firestore-backups/asia-south1'}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">PITR Note:</span>{' '}
                  {posture?.disasterRecovery.pitrStagingNote}
                </div>
              </div>

              {isOwner && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={drillNotes}
                    onChange={e => setDrillNotes(e.target.value)}
                    placeholder="Optional DR drill notes (e.g., Monthly integrity check)"
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    disabled={securityLoading}
                    onClick={handleRunDrDrill}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <HardDriveDownload className="w-3.5 h-3.5" />
                    <span>Run DR Drill</span>
                  </button>
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700">Recent Verification Drills</div>
                {drDrills.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No recorded verification drills yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {drDrills.slice(0, 5).map(d => (
                      <div key={d.id} className="p-2.5 border border-slate-200 rounded-lg text-[11px] flex items-center justify-between">
                        <div>
                          <span className="font-mono font-semibold text-slate-800">{d.id}</span>
                          <span className="text-slate-500 block">
                            Journals: {d.integritySummary.journalCount} · Unbalanced: {d.integritySummary.unbalancedJournals}
                          </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                          {d.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Immutable Audit Log Viewer */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSearch className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Immutable Security & Compliance Audit Trail
                </h3>
              </div>
              <input
                type="text"
                value={auditSearch}
                onChange={e => setAuditSearch(e.target.value)}
                placeholder="Filter by action or actor..."
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg w-full sm:w-64"
              />
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Timestamp</th>
                    <th className="py-2 px-3">Action</th>
                    <th className="py-2 px-3">Actor</th>
                    <th className="py-2 px-3">Details (Masked PHI)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">
                        No matching audit events found.
                      </td>
                    </tr>
                  ) : (
                    filteredAuditLogs.slice(0, 40).map((log, idx) => (
                      <tr key={log.id || `${log.timestamp}-${idx}`} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                          {log.action}
                        </td>
                        <td className="py-2 px-3 text-slate-600">{log.actingUserId}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-500 max-w-md truncate">
                          {log.metadata ? JSON.stringify(log.metadata) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Role Permissions Matrix */}
      {activeTab === 'roles' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Role-Based Access Control (RBAC)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Strict access levels configured for independent stores and multi-branch employees
            </p>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                  <th className="py-2.5 px-4">Module / Permission</th>
                  <th className="py-2.5 px-4 text-center font-bold text-blue-700">Owner (Admin)</th>
                  <th className="py-2.5 px-4 text-center font-bold text-slate-800">Pharmacist</th>
                  <th className="py-2.5 px-4 text-center font-bold text-slate-800">Cashier</th>
                  <th className="py-2.5 px-4 text-center font-bold text-slate-800">Auditor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">POS Billing & Dispensing</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Medicines Master & Composition</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Edit</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-blue-700 font-semibold">✓ View Only</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Inventory & Expiry Audit</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-blue-700 font-semibold">✓ View Only</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Customer Directory & Khata Settle</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ View</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Settle Only</td>
                  <td className="py-2 px-4 text-center text-blue-700 font-semibold">✓ Masked Phone</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Suppliers & Stock Inward</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Inward</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-blue-700 font-semibold">✓ View Only</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Accounts & Ledger Registers</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-blue-700 font-semibold">✓ Audit View</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Security Posture & Audit Logs</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full + DR/DPDP</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-blue-700 font-semibold">✓ Read Only</td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-800">Pharmacy Licensing & Store Settings</td>
                  <td className="py-2 px-4 text-center text-emerald-600 font-bold">✓ Full</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                  <td className="py-2 px-4 text-center text-slate-400">✗ Hidden</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Backend & Cloud Architecture */}
      {activeTab === 'architecture' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              System Architecture & Firebase Cloud Infrastructure
            </h3>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-700 leading-relaxed">
            <div className="font-bold text-slate-900">
              Standardized Firebase-First Production Architecture:
            </div>
            <p>
              PharmaDesk operates exclusively on Google Cloud and Firebase managed services in <span className="font-mono font-semibold">asia-south1</span> (Mumbai):
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 pl-1">
              <li>
                <span className="font-semibold text-slate-800">Primary Business Database:</span> Cloud Firestore serves as the sole authoritative database with tenant-isolated collections (<span className="font-mono">tenants/{'{tenantId}'}/...</span>), ACID transactions, and fail-closed Security Rules.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Identity & Access Control:</span> Firebase Authentication manages staff identity; Express verifies ID tokens via Firebase Admin SDK and evaluates live roles/branches from Firestore memberships on every request.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Backend & Storage:</span> Node.js + Express + TypeScript on Google Cloud Run (<span className="font-mono">asia-south1</span>) paired with tenant/branch-isolated Firebase Storage for invoice PDFs and documents.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Client Hosting & Data Policy:</span> Served via Firebase Hosting. Authoritative pharmacy business records are never persisted in browser <span className="font-mono">localStorage</span> or <span className="font-mono">IndexedDB</span>.
              </li>
            </ul>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Hosting & API Runtime
              </span>
              <span className="font-bold text-slate-900 block mt-1">Firebase Hosting + Cloud Run</span>
              <span className="text-emerald-700 font-medium text-[11px]">✓ asia-south1 (Mumbai)</span>
            </div>
            <div className="p-3 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Primary Database
              </span>
              <span className="font-bold text-slate-900 block mt-1">Cloud Firestore</span>
              <span className="text-emerald-700 font-medium text-[11px]">✓ Sole Business Ledger</span>
            </div>
            <div className="p-3 border border-slate-200 rounded-xl">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Identity & Storage
              </span>
              <span className="font-bold text-slate-900 block mt-1">Firebase Auth + Storage</span>
              <span className="text-emerald-700 font-medium text-[11px]">✓ Admin SDK & App Check</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
