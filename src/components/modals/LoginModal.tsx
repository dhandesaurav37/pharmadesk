/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Lock,
  Phone,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { UserRole } from '../../types/pharmacy.ts';

export const LoginModal: React.FC = () => {
  const {
    isLoginModalOpen,
    setIsLoginModalOpen,
    currentUser,
    switchUserRole,
    usersList,
  } = usePharmacy();

  const [authMode, setAuthMode] = useState<'quick' | 'phone'>('quick');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loginNotification, setLoginNotification] = useState<string | null>(null);

  if (!isLoginModalOpen) return null;

  const handleQuickLogin = (role: UserRole) => {
    switchUserRole(role);
    const target = usersList.find(u => u.role === role);
    setLoginNotification(`Authenticated as ${target?.name} (${role.toUpperCase()})`);
    setTimeout(() => {
      setLoginNotification(null);
      setIsLoginModalOpen(false);
    }, 1000);
  };

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.length >= 10) {
      setOtpSent(true);
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    switchUserRole('pharmacist');
    setLoginNotification('Phone verification simulated. Switched to Pharmacist role.');
    setTimeout(() => {
      setLoginNotification(null);
      setIsLoginModalOpen(false);
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
              P+
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">PharmaDesk Staff Sign In</h3>
              <p className="text-[11px] text-slate-500">Cloud Pharmacy Identity Management</p>
            </div>
          </div>

          <button
            onClick={() => setIsLoginModalOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loginNotification && (
          <div className="p-3 bg-emerald-50 border-b border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{loginNotification}</span>
          </div>
        )}

        <div className="p-6">
          {/* Architecture notice */}
          <div className="mb-5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">Phase 1 Auth Mockup:</span> Ready for Firebase Authentication with custom role claims (Owner, Pharmacist, Cashier). Select a staff profile below to test permission boundaries.
              </div>
            </div>
          </div>

          {/* Quick Demo Staff Profiles */}
          <div className="space-y-2 mb-6">
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Quick Test Profiles
            </label>

            {usersList.map(user => {
              const isActive = currentUser.role === user.role;
              return (
                <button
                  key={user.id}
                  onClick={() => handleQuickLogin(user.role)}
                  className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                    isActive
                      ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600/30'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                      {user.name.charAt(0)}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 block">
                        {user.name}
                      </span>
                      <span className="text-[11px] text-slate-500 block capitalize">
                        Role: {user.role === 'owner' ? 'Store Owner' : user.role} • {user.email}
                      </span>
                    </div>
                  </div>

                  {isActive ? (
                    <span className="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                      Active
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 group-hover:text-slate-600">
                      Switch →
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Simulated Mobile OTP */}
          <div className="pt-4 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-700 mb-2">
              Staff Mobile OTP Verification
            </div>

            {!otpSent ? (
              <form onSubmit={handleSendOtp} className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-mono">+91</span>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="98200 12345"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    className="w-full pl-11 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shrink-0 shadow-xs"
                >
                  Send OTP
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-2">
                <div className="text-[11px] text-emerald-600 font-medium">
                  OTP sent to +91 {phoneNumber} (Use test code: 123456)
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Enter 6-digit OTP"
                    value={otp}
                    onChange={e => setOtp(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap shrink-0 shadow-xs"
                  >
                    Verify & Sign In
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
