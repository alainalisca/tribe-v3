'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  /** The user's stored preference. 'system' follows the OS setting. */
  theme: Theme;
  /** The actually-applied theme after resolving 'system'. Always 'light' or 'dark'. */
  resolvedTheme: ResolvedTheme;
  /** Set the preference explicitly. Persists to localStorage. */
  setTheme: (theme: Theme) => void;
  /**
   * Backward-compat helper kept so existing <ThemeToggle> call sites keep
   * working. Flips between explicit light/dark (never sets 'system' — an
   * explicit toggle implies an explicit choice).
   */
  toggleTheme: () => void;
}

const STORAGE_KEY = 'tribe-theme';
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return theme;
}

function getStoredTheme(): Theme {
  // DEFAULT: light. New users (and SSR) start light. We never silently
  // follow the OS unless the user explicitly picks "System" — the app is
  // used outdoors in daylight where dark mode is unreadable.
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  return 'light';
}

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');
  const [mounted, setMounted] = useState(false);

  // Hydrate the stored preference once on mount. The inline FOUC script in
  // app/layout.tsx has already applied the correct class before paint, so
  // this only syncs React state — no flash.
  useEffect(() => {
    const stored = getStoredTheme();
    setThemeState(stored);
    setResolvedTheme(resolveTheme(stored));
    setMounted(true);
  }, []);

  // Apply + persist whenever the preference changes.
  useEffect(() => {
    if (!mounted) return;
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyThemeClass(resolved);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme, mounted]);

  // While following the system, react to OS appearance changes live.
  useEffect(() => {
    if (!mounted || theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      const resolved: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolvedTheme(resolved);
      applyThemeClass(resolved);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, mounted]);

  const setTheme = (t: Theme) => setThemeState(t);

  const toggleTheme = () => {
    setThemeState((prev) => (resolveTheme(prev) === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
