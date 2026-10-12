'use client';

/**
 * Tribe.OS shell — persistent dark sidebar + light top bar rendered
 * on every `/os/*` surface via `app/os/layout.tsx`.
 *
 * Layout (desktop, lg+):
 *   - Left dark sidebar (~224px wide):
 *       Tribe. wordmark + OS tag
 *       Vertical nav: Dashboard, Members, Teams, Programs, Schedule,
 *                     Revenue, Messages, Intelligence, Settings
 *       User card + Sign Out pinned to the bottom
 *   - Right main column on a light-gray surface:
 *       Sticky top bar with section title + notification bell + help
 *       Page content below
 *
 * Mobile: sidebar collapses to a slide-out drawer triggered from a
 * hamburger button in the top bar.
 *
 * Non-premium users see only the main column (no sidebar) — the page
 * itself surfaces the upgrade flow.
 */

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  Users2,
  Calendar,
  DollarSign,
  TrendingUp,
  BarChart3,
  Brain,
  HeartPulse,
  MessageSquare,
  Upload,
  CalendarDays,
  ClipboardList,
  ListOrdered,
  UserPlus,
  Settings as SettingsIcon,
  HelpCircle,
  Home as HomeIcon,
  LogOut,
  Menu,
  X as XIcon,
} from 'lucide-react';
import OSShellBell from './OSShellBell';
import PwaInstallPrompt from './PwaInstallPrompt';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { getTribeOSPremiumStatusForUser } from '@/lib/dal/tribeOSPremium';

type ProfileProbe = {
  name?: string | null;
};

type PremiumStatus = 'unknown' | 'premium' | 'not_premium';

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    wordmark: 'Tribe.',
    wordmarkSub: 'OS',
    topBarTitle: 'Dashboard',
    nav: {
      dashboard: 'Dashboard',
      members: 'Members',
      teams: 'Teams',
      programs: 'Programs',
      schedule: 'Schedule',
      revenue: 'Revenue',
      forecast: 'Forecast',
      analytics: 'Analytics',
      weekly: 'Weekly',
      messages: 'Messages',
      intelligence: 'Intelligence',
      leads: 'Leads',
      tasks: 'Tasks',
      sequences: 'Sequences',
      retention: 'Retention',
      import: 'Import',
      settings: 'Settings',
    },
    bellAria: 'Notifications',
    helpAria: 'Help and feedback',
    backToTribeAria: 'Back to Tribe',
    signOut: 'Sign Out',
    userLabel: 'User',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  es: {
    wordmark: 'Tribe.',
    wordmarkSub: 'OS',
    topBarTitle: 'Panel',
    nav: {
      dashboard: 'Panel',
      members: 'Miembros',
      teams: 'Equipos',
      programs: 'Programas',
      schedule: 'Horario',
      revenue: 'Ingresos',
      forecast: 'Pronóstico',
      analytics: 'Analítica',
      weekly: 'Semanal',
      messages: 'Mensajes',
      intelligence: 'Inteligencia',
      leads: 'Leads',
      tasks: 'Tareas',
      sequences: 'Secuencias',
      retention: 'Retención',
      import: 'Importar',
      settings: 'Ajustes',
    },
    bellAria: 'Notificaciones',
    helpAria: 'Ayuda y comentarios',
    backToTribeAria: 'Volver a Tribe',
    signOut: 'Cerrar sesión',
    userLabel: 'Usuario',
    openMenu: 'Abrir menú',
    closeMenu: 'Cerrar menú',
  },
} as const;

interface NavItem {
  href: string;
  labelKey: keyof (typeof copy.en)['nav'];
  Icon: typeof LayoutDashboard;
  /** Path prefix this item is considered active for. */
  matchPrefix: string;
}

// Programs + Messages are intentionally NOT listed: their routes are
// ComingSoonPage placeholders. Promising unbuilt features in the
// primary nav of a paid tier erodes trust on day one. Re-add here when
// the real surfaces ship (routes still exist for any deep links).
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/os/dashboard', labelKey: 'dashboard', Icon: LayoutDashboard, matchPrefix: '/os/dashboard' },
  { href: '/os/tasks', labelKey: 'tasks', Icon: ClipboardList, matchPrefix: '/os/tasks' },
  { href: '/os/members', labelKey: 'members', Icon: Users, matchPrefix: '/os/members' },
  { href: '/os/teams', labelKey: 'teams', Icon: Users2, matchPrefix: '/os/teams' },
  { href: '/os/schedule', labelKey: 'schedule', Icon: Calendar, matchPrefix: '/os/schedule' },
  { href: '/os/revenue', labelKey: 'revenue', Icon: DollarSign, matchPrefix: '/os/revenue' },
  { href: '/os/forecast', labelKey: 'forecast', Icon: TrendingUp, matchPrefix: '/os/forecast' },
  { href: '/os/analytics', labelKey: 'analytics', Icon: BarChart3, matchPrefix: '/os/analytics' },
  { href: '/os/weekly', labelKey: 'weekly', Icon: CalendarDays, matchPrefix: '/os/weekly' },
  { href: '/os/intelligence', labelKey: 'intelligence', Icon: Brain, matchPrefix: '/os/intelligence' },
  { href: '/os/leads', labelKey: 'leads', Icon: UserPlus, matchPrefix: '/os/leads' },
  { href: '/os/retention', labelKey: 'retention', Icon: HeartPulse, matchPrefix: '/os/retention' },
  { href: '/os/sequences', labelKey: 'sequences', Icon: ListOrdered, matchPrefix: '/os/sequences' },
  { href: '/os/messages', labelKey: 'messages', Icon: MessageSquare, matchPrefix: '/os/messages' },
  { href: '/os/import', labelKey: 'import', Icon: Upload, matchPrefix: '/os/import' },
  { href: '/os/settings', labelKey: 'settings', Icon: SettingsIcon, matchPrefix: '/os/settings' },
] as const;

function isActive(pathname: string | null, prefix: string): boolean {
  if (!pathname) return false;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export default function OSShell({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const s = copy[language];
  const pathname = usePathname();
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>('unknown');
  const [user, setUser] = useState<{ email: string | null; name: string | null } | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [taskCount, setTaskCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        if (!cancelled) {
          setPremiumStatus('not_premium');
          setUser(null);
        }
        return;
      }
      // Premium decision via the gym-aware resolver (owned -> coached
      // -> legacy) so a non-owner coach at a premium gym gets the full
      // shell. Fails CLOSED to the minimal shell on a transient error;
      // page-level gates make the authoritative per-route decision.
      const premium = await getTribeOSPremiumStatusForUser(supabase, authUser.id);
      if (cancelled) return;
      // name from public.users; email from the auth session (auth.users), the
      // caller's own address — no longer reads public.users.email (T-SEC5).
      const { data: profile } = await supabase.from('users').select('name').eq('id', authUser.id).single();
      if (cancelled) return;
      const p = (profile ?? null) as ProfileProbe | null;
      setPremiumStatus(premium.success && premium.data?.active ? 'premium' : 'not_premium');
      setUser({ email: authUser.email ?? null, name: p?.name ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (premiumStatus !== 'premium') return;
    let cancelled = false;
    (async () => {
      try {
        const [res, leadsRes] = await Promise.all([
          fetch('/api/tribe-os/sequences/tasks'),
          fetch('/api/tribe-os/leads/tasks'),
        ]);
        const json = await res.json();
        const leadsJson = await leadsRes.json();
        if (!cancelled) {
          const seqCount = json.success ? (json.data?.tasks ?? []).length : 0;
          const leadCount = leadsJson.success ? (leadsJson.data ?? []).length : 0;
          setTaskCount(seqCount + leadCount);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [premiumStatus, pathname]);

  // Lock body scroll while the mobile drawer is open so the page
  // behind doesn't scroll under it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [mobileNavOpen]);

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      window.location.href = '/';
    }
  }

  const showFullShell = premiumStatus !== 'not_premium';
  const initial = (user?.name?.charAt(0) || user?.email?.charAt(0) || '?').toUpperCase();
  const displayEmail = user?.email ?? '';

  // Non-premium / unknown-and-not-yet-signed-in: render bare children
  // with only the light surface. The page-level upgrade flow handles
  // the rest. Avoids flashing a sidebar to users who can't use it.
  if (premiumStatus === 'not_premium') {
    return <div className="min-h-screen bg-tribe-dark-40 text-tribe-dark">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-tribe-dark-40 text-tribe-dark lg:flex">
      {/* Mobile scrim. Closes the drawer on tap. */}
      {mobileNavOpen ? (
        <button
          type="button"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileNavOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
        />
      ) : null}

      {/* Sidebar — mirrors the sibling tribe-os codebase pixel-for-
          pixel: fixed 220px width (via spacing.sidebar token), dark
          surface, active items get a tribe-green fill plus a darker
          left-border accent that visually pins the active row to
          the rail. */}
      <aside
        className={`fixed lg:sticky top-0 z-50 h-[100dvh] w-sidebar bg-tribe-dark border-r border-tribe-dark-80 text-white flex flex-col transition-transform pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Wordmark + close-button on mobile */}
        <div className="px-6 py-6 flex items-center border-b border-tribe-dark-80">
          {/* Brand lockup: one image, /tribe-os-wordmark.png. It is the
              official Tribe. wordmark with a white capital OS set in the
              wordmark's own typeface (Fira Sans Bold) at full cap height,
              lime only on the dot, same treatment as the Tribe.TV logo.
              Do not rebuild any part of it as live text. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tribe-os-wordmark.png" alt="Tribe.OS" className="h-8 w-auto block" />
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label={s.closeMenu}
            className="lg:hidden ml-auto p-1 text-tribe-dark-60 hover:text-white"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Tribe.OS" className="flex-1 px-3 py-6 overflow-y-auto">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.matchPrefix);
              const label = s.nav[item.labelKey];
              const Icon = item.Icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm rounded-tribe transition-all ${
                      active
                        ? 'bg-tribe-green text-tribe-dark font-semibold border-l-4 border-tribe-green-dark'
                        : 'text-tribe-dark-60 hover:text-white hover:bg-tribe-dark-80'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{label}</span>
                    {item.labelKey === 'tasks' && taskCount > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold bg-tribe-green-dark text-white">
                        {taskCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User card + Sign Out */}
        <div className="border-t border-tribe-dark-80 p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full border-2 border-tribe-green-dark bg-tribe-green-50 text-tribe-green-dark font-semibold flex items-center justify-center text-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">{user?.name || s.userLabel}</p>
              <p className="text-xs text-tribe-dark-60 truncate">{displayEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-tribe text-sm font-semibold text-tribe-danger bg-red-100 hover:bg-red-200 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            {s.signOut}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar — canonical 60px content height (spacing.topbar). The bar
            GROWS by the safe-area inset rather than padding INTO a fixed
            height. Mobile uses max(env(safe-area-inset-top), 44px) — the same
            floor as .pt-header — because mobile Safari (non-standalone) reports
            env(safe-area-inset-top) as 0, which slid the title under the status
            bar. Desktop has no status bar, so lg: drops back to a flat 60px. */}
        <header className="sticky top-0 z-30 bg-white border-b border-tribe-dark-40 h-[calc(60px_+_max(env(safe-area-inset-top,0px),44px))] lg:h-[60px] flex items-center gap-2 px-4 lg:px-8 pt-[max(env(safe-area-inset-top,0px),44px)] lg:pt-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label={s.openMenu}
            className="lg:hidden p-2 -ml-2 text-tribe-dark-80 hover:text-tribe-dark rounded-tribe hover:bg-tribe-dark-40"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-tribe-dark">
            {NAV_ITEMS.find((n) => isActive(pathname, n.matchPrefix))
              ? s.nav[NAV_ITEMS.find((n) => isActive(pathname, n.matchPrefix))!.labelKey]
              : pathname?.startsWith('/os/clients')
                ? s.nav.members
                : s.topBarTitle}
          </h1>
          <div className="flex-1" />
          {/* Quick switch back to the consumer Tribe app. Premium
              owners flip between Tribe.OS and the community/training
              surface many times a day — this is the reverse pair to
              TribeOSQuickAccess that lives in the home FilterBar. */}
          <Link
            href="/"
            aria-label={s.backToTribeAria}
            title={s.backToTribeAria}
            className="w-9 h-9 inline-flex items-center justify-center text-tribe-dark-80 hover:text-tribe-dark rounded-full hover:bg-tribe-dark-40 transition-colors"
          >
            <HomeIcon className="w-5 h-5" />
          </Link>
          <OSShellBell ariaLabel={s.bellAria} />
          <Link
            href="/feedback"
            aria-label={s.helpAria}
            className="w-9 h-9 inline-flex items-center justify-center bg-tribe-green/25 text-tribe-dark rounded-full hover:bg-tribe-green/45 transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
          </Link>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {/* PWA install nudge — auto-shows when the browser fires
          beforeinstallprompt and the user hasn't dismissed within
          the last 30 days. Self-hides for installed users and the
          native Capacitor wrapper. */}
      <PwaInstallPrompt />
    </div>
  );
}
