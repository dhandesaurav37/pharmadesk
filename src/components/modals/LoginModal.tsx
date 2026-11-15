/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  X,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { usePharmacy } from '../../context/PharmacyContext.tsx';
import { UserRole } from '../../types/pharmacy.ts';
import { requestPasswordReset, signInWithEmail } from '../../lib/firebaseClient.ts';

interface LoginModalProps {
  onEnterWorkspace?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onEnterWorkspace }) => {
  const {
    isLoginModalOpen,
    setIsLoginModalOpen,
    currentUser,
    switchUserRole,
    usersList,
    firebaseSession,
    signOutSession,
  } = usePharmacy();

  const [viewMode, setViewMode] = useState<'signin' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginNotification, setLoginNotification] = useState<string | null>(null);

  if (!isLoginModalOpen) return null;

  const isProdBuild = import.meta.env.PROD;
  const showDevRolePreview = !isProdBuild && !firebaseSession.authenticated;

  const handleFirebaseSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoginNotification(null);
    setIsSubmitting(true);
    try {
      const { user } = await signInWithEmail(email, password);
      setLoginNotification(`Signed in as ${user.email || user.uid}`);
      setPassword('');
      setTimeout(() => {
        setLoginNotification(null);
        setIsLoginModalOpen(false);
        onEnterWorkspace?.();
      }, 700);
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setAuthError('Invalid email or password.');
      } else if (code === 'auth/user-disabled') {
        setAuthError('This Firebase account has been disabled. Contact your store owner.');
      } else if (code === 'auth/too-many-requests') {
        setAuthError('Too many failed attempts. Please wait before retrying or reset your password.');
      } else {
        setAuthError(err?.message || 'Unable to sign in with Firebase Authentication.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setLoginNotification(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setLoginNotification(`Password reset instructions sent to ${email.trim()}.`);
      setViewMode('signin');
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to send password reset email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await signOutSession();
      setLoginNotification('Signed out and backend refresh token revoked.');
    } catch (err: any) {
      setAuthError(err?.message || 'Unable to sign out cleanly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = (role: UserRole) => {
    switchUserRole(role);
    const target = usersList.find(u => u.role === role);
    setLoginNotification(`Preview profile switched to ${target?.name} (${role.toUpperCase()})`);
    setTimeout(() => {
      setLoginNotification(null);
      setIsLoginModalOpen(false);
      onEnterWorkspace?.();
    }, 600);
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
              <p className="text-[11px] text-slate-500">Firebase Auth &amp; Live Firestore RBAC</p>
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

        {(authError || firebaseSession.authError) && (
          <div className="p-3 bg-rose-50 border-b border-rose-200 text-xs font-medium text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{authError || firebaseSession.authError}</span>
          </div>
        )}

        <div className="p-6 space-y-5">
          {/* Architecture notice */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">Firebase Auth &amp; App Check:</span>{' '}
                {firebaseSession.configured
                  ? `Connected to Firebase project. App Check attestation: ${
                      firebaseSession.appCheckConfigured ? 'Configured' : 'Not configured'
                    }.`
                  : 'Set VITE_FIREBASE_* environment variables to sign in against your Firebase project.'}
              </div>
            </div>
          </div>

          {firebaseSession.authenticated ? (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-3">
              <div className="text-xs text-slate-800">
                <span className="font-semibold block">Signed in via Firebase Authentication</span>
                <span className="text-slate-600 block mt-0.5">{firebaseSession.email || firebaseSession.uid}</span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Email verified: {firebaseSession.emailVerified ? 'Yes' : 'Pending'}
                </span>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSignOut}
                className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out &amp; Revoke Session</span>
              </button>
            </div>
          ) : firebaseSession.configured ? (
            viewMode === 'signin' ? (
              <form onSubmit={handleFirebaseSignIn} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Staff Email</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="pharmacist@yourpharmacy.in"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60"
                >
                  {isSubmitting ? 'Signing In...' : 'Sign In with Firebase'}
                </button>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setViewMode('reset');
                    }}
                    className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
                  >
                    Forgot password? Reset via email
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Registered Staff Email</label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="pharmacist@yourpharmacy.in"
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-60"
                >
                  {isSubmitting ? 'Sending Reset Email...' : 'Send Password Reset Link'}
                </button>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setViewMode('signin');
                    }}
                    className="text-[11px] font-medium text-slate-600 hover:text-slate-800"
                  >
                    Back to Sign In
                  </button>
                </div>
              </form>
            )
          ) : isProdBuild ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              Firebase Web SDK configuration (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`) is required in production builds.
            </div>
          ) : null}

          {/* Development-Only UI Permission Preview */}
          {showDevRolePreview && (
            <div className="space-y-2 pt-3 border-t border-slate-200">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Local Dev Role Preview Profiles
              </label>

              {usersList.map(user => {
                const isActive = currentUser.role === user.role;
                return (
                  <button
                    key={user.id}
                    onClick={() => handleQuickLogin(user.role)}
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                      isActive
                        ? 'border-blue-600 bg-blue-50/60 ring-1 ring-blue-600/30'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
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
                      <span className="text-xs text-slate-400">Preview →</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
