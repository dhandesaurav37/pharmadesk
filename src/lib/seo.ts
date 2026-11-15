/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { PAGE_SEO_MAP } from '../config/seoRoutes.ts';
import type { MarketingRoutePath } from '../config/seoRoutes.ts';

export { PAGE_SEO_MAP };
export type { MarketingRoutePath, PageSeoMeta } from '../config/seoRoutes.ts';

function upsertMetaTag(attr: 'name' | 'property', key: string, content: string): void {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLinkTag(rel: string, href: string): void {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function usePageSeo(route: MarketingRoutePath): void {
  useEffect(() => {
    const meta = PAGE_SEO_MAP[route] || PAGE_SEO_MAP['/'];
    document.title = meta.title;

    upsertMetaTag('name', 'description', meta.description);
    upsertMetaTag('property', 'og:title', meta.title);
    upsertMetaTag('property', 'og:description', meta.description);
    upsertMetaTag('name', 'twitter:title', meta.title);
    upsertMetaTag('name', 'twitter:description', meta.description);
    upsertMetaTag('name', 'robots', meta.robots || 'index, follow');

    if (typeof window !== 'undefined' && window.location?.origin) {
      const canonical = `${window.location.origin}${route === '/' ? '/' : route}`;
      upsertLinkTag('canonical', canonical);
      upsertMetaTag('property', 'og:url', canonical);
    }
  }, [route]);
}
