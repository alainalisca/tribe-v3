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
  ClipboardList,
  Calendar,
  DollarSign,
  MessageSquare,
  Brain,
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
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';

type PremiumProbe = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'> & {
  name?: string | null;
  email?: string | null;
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
      messages: 'Messages',
      intelligence: 'Intelligence',
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
      messages: 'Mensajes',
      intelligence: 'Inteligencia',
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

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/os/dashboard', labelKey: 'dashboard', Icon: LayoutDashboard, matchPrefix: '/os/dashboard' },
  { href: '/os/members', labelKey: 'members', Icon: Users, matchPrefix: '/os/members' },
  { href: '/os/teams', labelKey: 'teams', Icon: Users2, matchPrefix: '/os/teams' },
  { href: '/os/programs', labelKey: 'programs', Icon: ClipboardList, matchPrefix: '/os/programs' },
  { href: '/os/schedule', labelKey: 'schedule', Icon: Calendar, matchPrefix: '/os/schedule' },
  { href: '/os/revenue', labelKey: 'revenue', Icon: DollarSign, matchPrefix: '/os/revenue' },
  { href: '/os/messages', labelKey: 'messages', Icon: MessageSquare, matchPrefix: '/os/messages' },
  { href: '/os/intelligence', labelKey: 'intelligence', Icon: Brain, matchPrefix: '/os/intelligence' },
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
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status, name, email')
        .eq('id', authUser.id)
        .single();
      if (cancelled) return;
      if (error || !data) {
        // Fail closed — non-premium gets the minimal shell.
        setPremiumStatus('not_premium');
        setUser({ email: authUser.email ?? null, name: null });
        return;
      }
      const row = data as PremiumProbe;
      setPremiumStatus(isTribeOSPremiumActive(row) ? 'premium' : 'not_premium');
      setUser({ email: row.email ?? authUser.email ?? null, name: row.name ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        className={`fixed lg:sticky top-0 z-50 h-screen w-sidebar bg-tribe-dark border-r border-tribe-dark-80 text-white flex flex-col transition-transform pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Wordmark + close-button on mobile */}
        <div className="px-6 py-6 flex items-center gap-3 border-b border-tribe-dark-80">
          <span className="text-xl font-black tracking-tight text-white">{s.wordmark}</span>
          <span className="text-xs font-semibold tracking-widest text-tribe-dark-60 uppercase">{s.wordmarkSub}</span>
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
        {/* Top bar — canonical 60px (spacing.topbar) */}
        <header className="sticky top-0 z-30 bg-white border-b border-tribe-dark-40 h-topbar flex items-center gap-2 px-4 lg:px-8 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label={s.openMenu}
            className="lg:hidden p-2 -ml-2 text-tribe-dark-80 hover:text-tribe-dark rounded-tribe hover:bg-tribe-dark-40"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-tribe-dark">{s.topBarTitle}</h1>
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
