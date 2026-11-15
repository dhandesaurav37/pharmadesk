/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Monitor, Boxes, Receipt, ShieldCheck } from 'lucide-react';
import type { HeroCameraPreset } from './ThreeHeroScene.tsx';

const LazyThreeHeroScene = lazy(() =>
  import('./ThreeHeroScene.tsx').then((mod) => ({ default: mod.ThreeHeroScene }))
);

const StaticWorkstationFallback: React.FC<{ preset: HeroCameraPreset }> = ({ preset }) => {
  return (
    <div className="w-full h-full min-h-[360px] lg:min-h-[480px] bg-slate-50 border border-slate-200 rounded-2xl p-5 sm:p-6 flex flex-col justify-between">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <span className="text-xs font-semibold text-slate-900 block">
            PharmaDesk Workstation Preview
          </span>
          <span className="text-[11px] text-slate-500">
            {preset === 'pos'
              ? 'GST POS Counter & Barcode Lookup'
              : preset === 'inventory'
              ? 'Batch Expiry & FEFO Stock Control'
              : 'Unified Counter Billing, Stock & Accounting'}
          </span>
        </div>
        <span className="text-[11px] font-mono text-blue-700 font-semibold">
          Sample Data
        </span>
      </div>

      <div className="my-4 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-900">Retail GST Invoice #INV-2026-1042</span>
          <span className="font-mono text-emerald-700 font-semibold">FEFO Active</span>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          <div className="py-2 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800 block">Dolo 650mg Strip (15 Tabs)</span>
              <span className="font-mono text-[11px] text-slate-500">Batch DL-2408 · Exp 10/2027</span>
            </div>
            <span className="font-mono font-semibold tabular-nums text-slate-900">Rs 68.00</span>
          </div>
          <div className="py-2 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800 block">Augmentin 625 Duo</span>
              <span className="font-mono text-[11px] text-slate-500">Batch AG-9914 · Exp 07/2027</span>
            </div>
            <span className="font-mono font-semibold tabular-nums text-slate-900">Rs 223.40</span>
          </div>
          <div className="py-2 flex items-center justify-between">
            <div>
              <span className="font-semibold text-slate-800 block">Pan-D Capsule Strip</span>
              <span className="font-mono text-[11px] text-slate-500">Batch PD-1182 · Exp 12/2027</span>
            </div>
            <span className="font-mono font-semibold tabular-nums text-slate-900">Rs 398.00</span>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-600">CGST + SGST Included · UPI &amp; Cash</span>
          <span className="font-mono text-sm font-bold tabular-nums text-blue-700">Rs 689.40</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Expiry Guard</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            Expired batches cannot be billed at the POS counter.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
            <Boxes className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Barcode &amp; FEFO</span>
          </div>
          <p className="text-[11px] text-slate-600 mt-1">
            Earliest-expiring stock prioritized automatically.
          </p>
        </div>
      </div>
    </div>
  );
};

export const Hero3DShowcase: React.FC = () => {
  const [preset, setPreset] = useState<HeroCameraPreset>('overview');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [forceStatic, setForceStatic] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [mountedClient, setMountedClient] = useState(false);

  useEffect(() => {
    setMountedClient(true);
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      setReducedMotion(mq.matches);
      const listener = (ev: MediaQueryListEvent) => setReducedMotion(ev.matches);
      mq.addEventListener?.('change', listener);
      return () => mq.removeEventListener?.('change', listener);
    }
    return undefined;
  }, []);

  const show3d = mountedClient && !reducedMotion && !forceStatic && !webglFailed;

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="relative flex-1 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white overflow-hidden min-h-[360px] lg:min-h-[480px]">
        {show3d ? (
          <Suspense fallback={<StaticWorkstationFallback preset={preset} />}>
            <LazyThreeHeroScene
              preset={preset}
              onWebglUnavailable={() => setWebglFailed(true)}
            />
          </Suspense>
        ) : (
          <StaticWorkstationFallback preset={preset} />
        )}
      </div>

      {/* Compact single-line viewport controls below the 3D viewport (zero occlusion) */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className="inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg"
          role="tablist"
          aria-label="Workstation focus view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={preset === 'overview'}
            onClick={() => setPreset('overview')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors ${
              preset === 'overview'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Workstation</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={preset === 'pos'}
            onClick={() => setPreset('pos')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors ${
              preset === 'pos'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>POS &amp; Scanner</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={preset === 'inventory'}
            onClick={() => setPreset('inventory')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors ${
              preset === 'inventory'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Batch &amp; Expiry</span>
          </button>
        </div>

        {!reducedMotion && !webglFailed && (
          <button
            type="button"
            onClick={() => setForceStatic((prev) => !prev)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 transition-colors"
          >
            {forceStatic ? 'Switch to 3D View' : 'Static Preview'}
          </button>
        )}
      </div>
    </div>
  );
};
