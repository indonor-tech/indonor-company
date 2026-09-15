'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const VISITOR_KEY = 'indonor_visitor_id';
const SESSION_KEY = 'indonor_visit_session';
const SESSION_MS = 10 * 60 * 1000;
const FLUSH_MS = 8000;
const HEARTBEAT_MS = 30000;
const MAX_TEXT = 120;

type AnalyticsEvent = {
  type: 'page_view' | 'page_leave' | 'click' | 'scroll' | 'heartbeat' | 'session_end' | 'form_submit';
  path: string;
  title: string;
  search: string;
  hash: string;
  occurredAt: string;
  durationMs?: number;
  scrollPercent?: number;
  form?: string;
  click?: {
    tag?: string;
    id?: string;
    className?: string;
    text?: string;
    href?: string;
    x?: number;
    y?: number;
    section?: string;
  };
};

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function visitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return uuid();
  }
}

function sessionState() {
  const now = Date.now();
  const landingPage = `${window.location.pathname}${window.location.search}`;
  const fallback = { id: uuid(), startedAt: now, lastSeenAt: now, landingPage };
  try {
    const current = readJson<{ id: string; startedAt: number; lastSeenAt: number; landingPage: string }>(SESSION_KEY, fallback);
    if (!current.id || now - Number(current.lastSeenAt || 0) > SESSION_MS) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(fallback));
      return fallback;
    }
    current.lastSeenAt = now;
    localStorage.setItem(SESSION_KEY, JSON.stringify(current));
    return current;
  } catch {
    return fallback;
  }
}

function utmFrom(search: string) {
  const params = new URLSearchParams(search);
  const utm = {
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
    term: params.get('utm_term') || '',
    content: params.get('utm_content') || ''
  };
  return Object.values(utm).some(Boolean) ? utm : undefined;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

function pageContext() {
  return {
    path: window.location.pathname || '/',
    title: document.title || '',
    search: window.location.search || '',
    hash: window.location.hash || '',
    occurredAt: new Date().toISOString()
  };
}

let eventSink: ((event: AnalyticsEvent, flushNow?: boolean) => void) | null = null;

export function trackWebsiteEvent(partial: Partial<AnalyticsEvent> & { type: AnalyticsEvent['type'] }) {
  if (typeof window === 'undefined') return;
  const event = { ...pageContext(), ...partial, occurredAt: new Date().toISOString() };
  if (eventSink) {
    eventSink(event, true);
    return;
  }
  window.dispatchEvent(new CustomEvent('indonor-analytics', { detail: event }));
}

function scrollPercent() {
  const root = document.documentElement;
  const height = root.scrollHeight - root.clientHeight;
  if (height <= 0) return 100;
  return Math.min(100, Math.round((window.scrollY / height) * 100));
}

function clickPayload(target: Element, event: MouseEvent) {
  if (target.closest('input, textarea, select, [contenteditable="true"]')) {
    const field = target.closest('input, textarea, select') || target;
    return {
      tag: field.tagName.toLowerCase(),
      id: field.id || '',
      className: typeof field.className === 'string' ? field.className.slice(0, 240) : '',
      text: field.getAttribute('name') || field.getAttribute('aria-label') || field.tagName.toLowerCase(),
      href: '',
      x: event.clientX,
      y: event.clientY,
      section: target.closest('header, nav, main, footer, section, [data-section]')?.getAttribute('data-section')
        || target.closest('header, nav, main, footer, section')?.tagName.toLowerCase()
        || ''
    };
  }
  const el = target.closest('a, button, [role="button"], summary, [data-track]') || target;
  const href = el instanceof HTMLAnchorElement ? el.href : el.getAttribute?.('href') || '';
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || '',
    className: typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className.slice(0, 240) : '',
    text: cleanText(el.textContent || el.getAttribute?.('aria-label') || ''),
    href: href.slice(0, 1000),
    x: event.clientX,
    y: event.clientY,
    section: el.closest('header, nav, main, footer, section, [data-section]')?.getAttribute('data-section')
      || el.closest('header, nav, main, footer, section')?.tagName.toLowerCase()
      || ''
  };
}

export default function WebsiteTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const queue: AnalyticsEvent[] = [];
    const seenScroll = new Set<number>();
    const pageStarted = Date.now();

    const enqueue = (event: AnalyticsEvent) => {
      queue.push(event);
      if (queue.length >= 12) flush(false);
    };

    const flush = (keepalive: boolean) => {
      if (!queue.length) return;
      const session = sessionState();
      const payload = {
        visitorId: visitorId(),
        sessionId: session.id,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        pixelRatio: window.devicePixelRatio || 1,
        referrer: document.referrer || '',
        landingPage: session.landingPage,
        utm: utmFrom(window.location.search),
        events: queue.splice(0, queue.length)
      };
      const body = JSON.stringify(payload);
      if (keepalive && navigator.sendBeacon) {
        const queued = navigator.sendBeacon('/api/analytics', new Blob([body], { type: 'application/json' }));
        if (queued) return;
      }
      fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive,
        credentials: 'omit'
      }).catch(() => undefined);
    };

    const leavePage = (type: AnalyticsEvent['type'] = 'page_leave') => {
      enqueue({
        type,
        ...pageContext(),
        durationMs: Date.now() - pageStarted,
        scrollPercent: scrollPercent()
      });
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      enqueue({ type: 'click', ...pageContext(), click: clickPayload(target, event) });
    };

    const onScroll = () => {
      const percent = scrollPercent();
      const mark = [25, 50, 75, 100].find((value) => percent >= value && !seenScroll.has(value));
      if (!mark) return;
      seenScroll.add(mark);
      enqueue({ type: 'scroll', ...pageContext(), scrollPercent: mark });
    };

    enqueue({ type: 'page_view', ...pageContext() });
    flush(false);
    eventSink = (event, flushNow) => {
      enqueue(event);
      if (flushNow) flush(false);
    };
    const onCustom = (custom: Event) => {
      const detail = (custom as CustomEvent<AnalyticsEvent>).detail;
      if (!detail?.type) return;
      enqueue({ ...pageContext(), ...detail, occurredAt: new Date().toISOString() });
      flush(false);
    };
    window.addEventListener('indonor-analytics', onCustom);
    const flushTimer = window.setInterval(() => flush(false), FLUSH_MS);
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      enqueue({ type: 'heartbeat', ...pageContext(), durationMs: Date.now() - pageStarted, scrollPercent: scrollPercent() });
    }, HEARTBEAT_MS);
    document.addEventListener('click', onClick, true);
    window.addEventListener('scroll', onScroll, { passive: true });
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        leavePage('page_leave');
        flush(true);
      }
    };
    const onUnload = () => {
      leavePage('session_end');
      flush(true);
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onUnload);

    return () => {
      leavePage('page_leave');
      flush(true);
      window.clearInterval(flushTimer);
      window.clearInterval(heartbeatTimer);
      eventSink = null;
      window.removeEventListener('indonor-analytics', onCustom);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [pathname]);

  return null;
}
