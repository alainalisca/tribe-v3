'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Currency } from '@/lib/payments/config';
import { CURRENCY_CHANGE_EVENT, detectInitialCurrency, getStoredCurrency, setStoredCurrency } from '@/lib/userCurrency';

/**
 * React hook for the user's preferred display currency. Hydrates from
 * localStorage on mount, falls back to a browser-locale heuristic for
 * first-time visitors, and listens for cross-tab + intra-tab changes so
 * a user toggling currency in /settings sees prices update everywhere
 * without a reload.
 */
export function useUserCurrency(): {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  hydrated: boolean;
} {
  // Default to COP on first render (matches Medellín-first launch). The
  // real value comes in once we hit the client and read localStorage —
  // `hydrated` lets a caller avoid flashing the wrong currency briefly.
  const [currency, setCurrencyState] = useState<Currency>('COP');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = getStoredCurrency();
    setCurrencyState(stored ?? detectInitialCurrency());
    setHydrated(true);

    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Currency>).detail;
      if (detail === 'USD' || detail === 'COP') setCurrencyState(detail);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'tribe.preferred_currency') return;
      if (e.newValue === 'USD' || e.newValue === 'COP') setCurrencyState(e.newValue as Currency);
    };
    window.addEventListener(CURRENCY_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CURRENCY_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    setStoredCurrency(c);
  }, []);

  return { currency, setCurrency, hydrated };
}
