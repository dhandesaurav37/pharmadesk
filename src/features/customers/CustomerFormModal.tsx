/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, UserPlus, CheckCircle2, AlertTriangle, Edit3 } from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import {
  Customer,
  CustomerAccount,
  CustomerGender,
  CustomerType,
} from '../../types/pharmacy.ts';
import {
  customerApi,
  ApiClientError,
} from '../../lib/customerApi.ts';
import { normalizeIndianPhone } from './customerHelpers.ts';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingCustomer?: CustomerAccount | null;
  onSaved?: (savedAccount: CustomerAccount) => void;
}

const CUSTOMER_TYPES: Array<{ value: CustomerType; label: string }> = [
  { value: 'REGULAR', label: 'Regular Patient' },
  { value: 'CHRONIC', label: 'Chronic Care' },
  { value: 'SENIOR_CITIZEN', label: 'Senior Citizen' },
  { value: 'VIP', label: 'VIP Account' },
  { value: 'CLINIC', label: 'Doctor / Clinic' },
  { value: 'CORPORATE', label: 'Corporate' },
];

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  editingCustomer,
  onSaved,
}) => {
  const {
    customers,
    addCustomer,
    updateCustomerRecord,
    apiSession,
    store,
  } = usePharmacy();

  const isEdit = Boolean(editingCustomer);
  const isLiveApi = Boolean(apiSession.bearerToken);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('REGULAR');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<CustomerGender | ''>('');
  const [preferredDoctorName, setPreferredDoctorName] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
  const [creditEnabled, setCreditEnabled] = useState(true);
  const [creditLimit, setCreditLimit] = useState<number>(5000);
  const [creditTermsDays, setCreditTermsDays] = useState<0 | 7 | 15 | 30>(15);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [notes, setNotes] = useState('');

  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [confirmSharedPhone, setConfirmSharedPhone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setDuplicateWarning(null);
    setConfirmSharedPhone(false);
    setSuccess(false);

    if (editingCustomer) {
      setName(editingCustomer.name || '');
      setPhone(editingCustomer.phoneMasked ? '' : editingCustomer.phone || '');
      setAlternatePhone(editingCustomer.alternatePhone || '');
      setEmail(editingCustomer.email || '');
      setCustomerType(editingCustomer.customerType || 'REGULAR');
      setGstin(editingCustomer.gstin || '');
      setAddress(editingCustomer.address || '');
      setCity(editingCustomer.city || '');
      setStateName(editingCustomer.state || '');
      setPincode(editingCustomer.pincode || '');
      setDateOfBirth(editingCustomer.dateOfBirth || '');
      setGender(editingCustomer.gender || '');
      setPreferredDoctorName(editingCustomer.preferredDoctorName || '');
      setAllergies(editingCustomer.allergies || '');
      setChronicConditions(editingCustomer.chronicConditions || '');
      setCreditEnabled(editingCustomer.creditEnabled);
      setCreditLimit(editingCustomer.creditLimit ?? 0);
      setCreditTermsDays(editingCustomer.creditTermsDays ?? 15);
      setOpeningBalance(0);
      setNotes(editingCustomer.notes || '');
    } else {
      setName('');
      setPhone('');
      setAlternatePhone('');
      setEmail('');
      setCustomerType('REGULAR');
      setGstin('');
      setAddress('');
      setCity('');
      setStateName('');
      setPincode('');
      setDateOfBirth('');
      setGender('');
      setPreferredDoctorName('');
      setAllergies('');
      setChronicConditions('');
      setCreditEnabled(true);
      setCreditLimit(5000);
      setCreditTermsDays(15);
      setOpeningBalance(0);
      setNotes('');
    }
  }, [isOpen, editingCustomer]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);

    const normalizedPhone = normalizeIndianPhone(phone);
    if (!isEdit || phone.trim()) {
      const digits = normalizedPhone.replace(/\D/g, '');
      if (digits.length < 10) {
        setErrorMsg('Enter a valid 10-digit Indian mobile number.');
        return;
      }
    }

    if (isLiveApi) {
      setSubmitting(true);
      try {
        if (isEdit && editingCustomer) {
          const updated = await customerApi.updateCustomer(apiSession, editingCustomer.id, {
            name: name.trim(),
            phone: phone.trim() ? normalizedPhone : undefined,
            alternatePhone: alternatePhone.trim() || null,
            email: email.trim() || null,
            customerType,
            gstin: gstin.trim() || null,
            address: address.trim() || null,
            city: city.trim() || null,
            state: stateName.trim() || null,
            pincode: pincode.trim() || null,
            dateOfBirth: dateOfBirth.trim() || null,
            gender: gender || null,
            preferredDoctorName: preferredDoctorName.trim() || null,
            allergies: allergies.trim() || null,
            chronicConditions: chronicConditions.trim() || null,
            creditEnabled,
            creditTermsDays,
            notes: notes.trim() || null,
            confirmSharedPhone,
          });
          setSuccess(true);
          onSaved?.(updated);
        } else {
          const created = await customerApi.createCustomer(apiSession, {
            name: name.trim(),
            phone: normalizedPhone,
            alternatePhone: alternatePhone.trim() || undefined,
            email: email.trim() || undefined,
            customerType,
            gstin: gstin.trim() || undefined,
            address: address.trim() || undefined,
            city: city.trim() || undefined,
            state: stateName.trim() || undefined,
            pincode: pincode.trim() || undefined,
            dateOfBirth: dateOfBirth.trim() || undefined,
            gender: gender || undefined,
            preferredDoctorName: preferredDoctorName.trim() || undefined,
            allergies: allergies.trim() || undefined,
            chronicConditions: chronicConditions.trim() || undefined,
            creditEnabled,
            creditLimit: Number(creditLimit) || 0,
            creditTermsDays,
            openingBalance: Number(openingBalance) || 0,
            notes: notes.trim() || undefined,
            confirmSharedPhone,
          });
          setSuccess(true);
          onSaved?.(created);
        }
        setTimeout(() => onClose(), 800);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 409) {
          setDuplicateWarning(err.detail);
        } else if (err instanceof ApiClientError) {
          setErrorMsg(err.detail);
        } else {
          setErrorMsg('Unable to save customer record.');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Preview / Local state mode
    if (phone.trim()) {
      const conflict = customers.find(
        c =>
          !c.isArchived &&
          c.id !== editingCustomer?.id &&
          normalizeIndianPhone(c.phone) === normalizedPhone
      );
      if (conflict && !confirmSharedPhone) {
        setDuplicateWarning(
          `Mobile number ${normalizedPhone} is already linked to '${conflict.name}'. Confirm shared phone below if this is a family/clinic account.`
        );
        return;
      }
    }

    if (isEdit && editingCustomer) {
      const updatedFields: Partial<Customer> = {
        name: name.trim(),
        phone: phone.trim() ? normalizedPhone : editingCustomer.phone,
        alternatePhone: alternatePhone.trim() || null,
        email: email.trim() || null,
        customerType,
        gstin: gstin.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateName.trim() || undefined,
        pincode: pincode.trim() || undefined,
        dateOfBirth: dateOfBirth.trim() || undefined,
        gender: gender || undefined,
        doctorName: preferredDoctorName.trim() || undefined,
        allergies: allergies.trim() || undefined,
        chronicConditions: chronicConditions.trim() || undefined,
        creditEnabled,
        creditTermsDays,
        notes: notes.trim() || undefined,
      };
      updateCustomerRecord(editingCustomer.id, updatedFields);
      setSuccess(true);
      onSaved?.({
        ...editingCustomer,
        ...updatedFields,
        preferredDoctorName: updatedFields.doctorName || null,
      });
    } else {
      const created = addCustomer({
        name: name.trim(),
        phone: normalizedPhone,
        alternatePhone: alternatePhone.trim() || null,
        email: email.trim() || null,
        customerType,
        gstin: gstin.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: stateName.trim() || undefined,
        pincode: pincode.trim() || undefined,
        dateOfBirth: dateOfBirth.trim() || undefined,
        gender: gender || undefined,
        doctorName: preferredDoctorName.trim() || undefined,
        allergies: allergies.trim() || undefined,
        chronicConditions: chronicConditions.trim() || undefined,
        creditEnabled,
        creditLimit: Number(creditLimit) || 0,
        creditTermsDays,
        khataBalance: Number(openingBalance) || 0,
        notes: notes.trim() || undefined,
      });

      const asAccount: CustomerAccount = {
        id: created.id,
        tenantId: store.id,
        primaryBranchId: 'main',
        name: created.name,
        phone: created.phone,
        customerType: created.customerType || 'REGULAR',
        creditEnabled: created.creditEnabled ?? true,
        creditLimit: created.creditLimit ?? 0,
        creditTermsDays: created.creditTermsDays ?? 15,
        currentOutstandingBalance: created.khataBalance,
        advanceBalance: 0,
        availableCredit: Math.max(0, (created.creditLimit ?? 0) - created.khataBalance),
        totalPurchases: 0,
        totalPayments: 0,
        totalVisits: 0,
        status: 'ACTIVE',
        isArchived: false,
        createdBy: 'local',
        updatedBy: 'local',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setSuccess(true);
      onSaved?.(asAccount);
    }

    setTimeout(() => onClose(), 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              {isEdit ? <Edit3 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {isEdit ? `Edit Customer · ${editingCustomer?.name}` : 'Register Customer & Khata Account'}
              </h3>
              <p className="text-[11px] text-slate-500">
                {isEdit
                  ? 'Update profile, clinical metadata & terms. Credit balance changes require ledger entries.'
                  : 'Create customer directory record, prescribing doctor linkage & credit policy'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {success ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h4 className="text-base font-bold text-slate-900">
              {isEdit ? 'Customer Profile Updated' : 'Customer Registered'}
            </h4>
            <p className="text-xs text-slate-500 mt-1">
              Directory profile and Khata settings saved.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {duplicateWarning && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
                <div className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{duplicateWarning}</span>
                </div>
                <label className="flex items-center gap-2 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmSharedPhone}
                    onChange={e => setConfirmSharedPhone(e.target.checked)}
                    className="rounded text-amber-600"
                  />
                  <span>Confirm shared family / clinic phone number</span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  placeholder="e.g. Rameshwar Gupta"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Mobile Number {isEdit && editingCustomer?.phoneMasked ? '(Optional — currently masked)' : '*'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-slate-400 font-mono">+91</span>
                  <input
                    type="tel"
                    required={!isEdit}
                    placeholder="98200 12345"
                    value={phone.replace(/^\+91\s*/, '')}
                    onChange={e => {
                      setPhone(e.target.value);
                      setDuplicateWarning(null);
                    }}
                    className="w-full pl-11 pr-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Customer Category
                </label>
                <select
                  value={customerType}
                  onChange={e => setCustomerType(e.target.value as CustomerType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-blue-600"
                >
                  {CUSTOMER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Alternate Mobile (Optional)
                </label>
                <input
                  type="tel"
                  placeholder="+91 98201 00000"
                  value={alternatePhone}
                  onChange={e => setAlternatePhone(e.target.value)}
                  className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="patient@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  GSTIN (B2B / Clinic Billing)
                </label>
                <input
                  type="text"
                  placeholder="27AAACP1234F1Z5"
                  value={gstin}
                  onChange={e => setGstin(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 font-mono uppercase border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            {/* Clinical & Prescriber Metadata */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Preferred Doctor
                </label>
                <input
                  type="text"
                  placeholder="Dr. Rajesh Mehta"
                  value={preferredDoctorName}
                  onChange={e => setPreferredDoctorName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={e => setDateOfBirth(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Gender
                </label>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value as CustomerGender | '')}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-blue-600"
                >
                  <option value="">Unspecified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                  <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Known Allergies
                </label>
                <input
                  type="text"
                  placeholder="e.g. Penicillin, Sulfa"
                  value={allergies}
                  onChange={e => setAllergies(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Chronic Conditions
                </label>
                <input
                  type="text"
                  placeholder="e.g. Type 2 Diabetes, Hypertension"
                  value={chronicConditions}
                  onChange={e => setChronicConditions(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            {/* Address */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Street / Flat / Area
                </label>
                <input
                  type="text"
                  placeholder="Flat 102, Shanti Niwas, Bandra West"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  placeholder="Mumbai"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Pincode
                </label>
                <input
                  type="text"
                  placeholder="400050"
                  value={pincode}
                  onChange={e => setPincode(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                />
              </div>
            </div>

            {/* Khata Policy */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl">
              <div className="flex items-center gap-2 sm:col-span-3">
                <input
                  id="creditEnabledToggle"
                  type="checkbox"
                  checked={creditEnabled}
                  onChange={e => setCreditEnabled(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="creditEnabledToggle" className="font-semibold text-slate-800 cursor-pointer">
                  Enable Khata Credit Facility
                </label>
              </div>

              {!isEdit ? (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Credit Limit (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={creditLimit}
                      onChange={e => setCreditLimit(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Default Credit Terms
                    </label>
                    <select
                      value={creditTermsDays}
                      onChange={e => setCreditTermsDays(Number(e.target.value) as 0 | 7 | 15 | 30)}
                      className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-blue-600"
                    >
                      <option value={0}>Due Immediately (0d)</option>
                      <option value={7}>Net 7 Days</option>
                      <option value={15}>Net 15 Days</option>
                      <option value={30}>Net 30 Days</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Opening Khata Due (₹)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={openingBalance}
                      onChange={e => setOpeningBalance(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:border-blue-600"
                    />
                  </div>
                </>
              ) : (
                <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <div>
                    Default Credit Terms:{' '}
                    <select
                      value={creditTermsDays}
                      onChange={e => setCreditTermsDays(Number(e.target.value) as 0 | 7 | 15 | 30)}
                      className="ml-1 px-2 py-1 font-mono border border-slate-300 rounded bg-white"
                    >
                      <option value={0}>0 Days</option>
                      <option value={7}>7 Days</option>
                      <option value={15}>15 Days</option>
                      <option value={30}>30 Days</option>
                    </select>
                  </div>
                  <span>
                    Credit limit & balance adjustments are controlled via dedicated audited actions.
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Internal Notes
              </label>
              <input
                type="text"
                placeholder="e.g. Monthly refill reminder on 5th"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg"
              >
                {submitting ? 'Saving...' : isEdit ? 'Save Profile Changes' : 'Register Customer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
