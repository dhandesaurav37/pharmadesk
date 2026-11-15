/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const rawBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

function isLocalhostUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url);
}

/**
 * Resolves a backend API path against VITE_API_BASE_URL when configured,
 * or falls back to relative paths (which route via Vite proxy in development
 * and Firebase Hosting `/api/** -> pharmadesk-api (asia-south1)` rewrite in production).
 */
export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!rawBaseUrl) {
    return normalizedPath;
  }

  // Safety guard: never allow hardcoded localhost API base URL in production bundles
  if (import.meta.env.PROD && isLocalhostUrl(rawBaseUrl)) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith('/api/') && rawBaseUrl.endsWith('/api')) {
    return `${rawBaseUrl.slice(0, -4)}${normalizedPath}`;
  }

  return `${rawBaseUrl}${normalizedPath}`;
}

export function getApiBaseUrlLabel(): string {
  if (rawBaseUrl && !(import.meta.env.PROD && isLocalhostUrl(rawBaseUrl))) {
    return rawBaseUrl;
  }
  return import.meta.env.PROD
    ? 'Same-Origin Firebase Hosting Rewrite (/api/** -> Cloud Run asia-south1)'
    : 'Vite Dev Proxy (/api/** -> http://127.0.0.1:3001)';
}
