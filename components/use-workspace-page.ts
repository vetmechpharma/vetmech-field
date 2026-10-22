'use client';
import {useCallback, useEffect, useState} from 'react';

const slug = (page: string) => page.trim().toLowerCase().replace(/\s+/g, '-');
export function permittedPage(value: string | null, allowed: readonly string[]) {
  let key = slug(value || 'Dashboard');
  if (['districts', 'headquarters', 'routes'].includes(key)) key = 'territory-setup';
  return allowed.find(page => slug(page) === key) || 'Dashboard';
}

/** Keep navigation in the URL so refresh, copied links and browser history agree. */
export function useWorkspacePage(role: string | undefined, pages: readonly string[], onNavigate: (page: string) => void) {
  const [page, setPage] = useState('Dashboard');
  const [readyRole, setReadyRole] = useState<string | null>(null);
  const allowedKey = pages.join('|');
  const navigate = useCallback((value: string, replace = false) => {
    if (!role) return;
    const next = permittedPage(value, allowedKey.split('|'));
    const url = new URL(window.location.href);
    if (next === 'Dashboard') url.searchParams.delete('page');
    else url.searchParams.set('page', slug(next));
    if (url.href !== window.location.href) {
      if (replace) window.history.replaceState(window.history.state, '', url);
      else window.history.pushState(window.history.state, '', url);
    }
    onNavigate(next);
    setPage(next);
    setReadyRole(role);
  }, [role, allowedKey, onNavigate]);
  useEffect(() => {
    if (!role) { setReadyRole(null); return; }
    const restore = () => navigate(new URL(window.location.href).searchParams.get('page') || 'Dashboard', true);
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [role, navigate]);
  return {page, navigate, ready: !!role && readyRole === role};
}
