import { env } from '../config/env.js';

function trimSlash(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function originOf(value) {
  try { return new URL(trimSlash(value)).origin; } catch { return ''; }
}

function appOrigins() {
  return [...new Set([
    env.localAppUrl,
    env.serverAppUrl,
    'http://localhost:5000',
    'http://127.0.0.1:5000',
    'https://indonor-tech.onrender.com'
  ].map(originOf).filter(Boolean))];
}

function assetPath(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    return new URL(value, 'http://asset.local').pathname;
  } catch {
    return value.startsWith('/') ? value : '';
  }
}

export function isOurAppAssetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (!/^https?:\/\//i.test(value)) return value.startsWith('/api/v1/');
  try {
    const parsed = new URL(value);
    if (/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)) return parsed.pathname.startsWith('/api/v1/');
    return appOrigins().includes(parsed.origin) && parsed.pathname.startsWith('/api/v1/');
  } catch {
    return false;
  }
}

export function normalizeStoredAssetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (!isOurAppAssetUrl(value)) return value;
  return assetPath(value) || value;
}

export function resolvePublicAssetUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^(data:|blob:)/i.test(value)) return value;
  if (!isOurAppAssetUrl(value)) return value;
  const path = assetPath(value);
  if (!path) return value;
  return `${trimSlash(env.activeAppUrl)}${path}`;
}
