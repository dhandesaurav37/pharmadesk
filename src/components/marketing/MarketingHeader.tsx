/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { MarketingRoutePath } from '../../lib/seo.ts';

interface MarketingHeaderProps {
  currentRoute: MarketingRoutePath;
  onNavigate: (route: MarketingRoutePath) => void;
  onOpenLogin: () => void;
  onStartTrial: () => void;
  isAuthenticated: boolean;
  onOpenWorkspace: () => void;
}

const NAV_LINKS: Array<{ route: MarketingRoutePath; label: string }> = [
  { route: '/', label: 'Home' },
  { route: '/features', label: 'Features' },
  { route: '/pricing', label: 'Pricing' },
  { route: '/about', label: 'About' },
  { route: '/contact', label: 'Contact' },
];

export const MarketingHeader: React.FC<MarketingHeaderProps> = ({
  currentRoute,
  onNavigate,
  onOpenLogin,
  onStartTrial,
  isAuthenticated,
  onOpenWorkspace,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLinkClick = (route: MarketingRoutePath) => {
    setMobileMenuOpen(false);
    onNavigate(route);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Clean single-line brand wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            handleLinkClick('/');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          PharmaDesk
        </a>

        {/* Zone 2: Primary navigation links (single-line) */}
        <nav
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          aria-label="Primary marketing navigation"
        >
          {NAV_LINKS.map((link) => {
            const isActive = currentRoute === link.route;
            return (
              <a
                key={link.route}
                href={link.route}
                onClick={(e) => {
                  e.preventDefault();
                  handleLinkClick(link.route);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                  isActive
                    ? 'text-slate-900 border-blue-600 font-semibold'
                    : 'border-transparent hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {link.label}
              </a>
            );
          })}
        </nav>

        {/* Zone 3: Account access & primary trial CTA */}
        <div className="hidden md:flex items-center gap-4 shrink-0">
          {isAuthenticated ? (
            <button
              type="button"
              onClick={onOpenWorkspace}
              className="text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              Open Workspace
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenLogin}
              className="text-sm font-medium text-slate-700 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              Login
            </button>
          )}
          <button
            type="button"
            onClick={onStartTrial}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
          >
            Start Free Trial
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onStartTrial}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap shrink-0"
          >
            Start Free Trial
          </button>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="p-2 rounded-lg text-slate-700 hover:bg-slate-100"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Compact Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.route}
              href={link.route}
              onClick={(e) => {
                e.preventDefault();
                handleLinkClick(link.route);
              }}
              className={`block px-3 py-2.5 rounded-lg text-sm font-medium ${
                currentRoute === link.route
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {link.label}
            </a>
          ))}

          <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (isAuthenticated) {
                  onOpenWorkspace();
                } else {
                  onOpenLogin();
                }
              }}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-300 text-sm font-semibold text-slate-800 text-center"
            >
              {isAuthenticated ? 'Open Pharmacy Workspace' : 'Login to Pharmacy Workspace'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
