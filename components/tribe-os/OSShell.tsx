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
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  X as XIcon,
} from 'lucide-react';
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
    return <div className="min-h-screen bg-gray-50 text-gray-900">{children}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 lg:flex">
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

      {/* Sidebar. Dark surface so the lime accents pop and the
          content-area light theme reads as the "canvas". */}
      <aside
        className={`fixed lg:sticky top-0 z-50 h-screen w-56 bg-tribe-dark text-white flex flex-col transition-transform pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Wordmark + close-button on mobile */}
        <div className="px-5 py-4 flex items-center gap-2">
          <span className="text-xl font-black tracking-tight">{s.wordmark}</span>
          <span className="text-[10px] font-bold tracking-[0.15em] text-white/40 uppercase">{s.wordmarkSub}</span>
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label={s.closeMenu}
            className="lg:hidden ml-auto p-1 text-white/60 hover:text-white"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Tribe.OS" className="flex-1 px-3 overflow-y-auto">
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
                    className={`flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                      active ? 'bg-tribe-green text-tribe-dark' : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User card + Sign Out */}
        <div className="px-3 pb-3 pt-3 border-t border-white/10 space-y-2">
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-9 h-9 rounded-full bg-tribe-green text-tribe-dark font-black flex items-center justify-center text-sm shrink-0">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">{user?.name || s.userLabel}</p>
              <p className="text-[10px] text-white/50 truncate">{displayEmail}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-tribe-red bg-tribe-red/10 hover:bg-tribe-red/20 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            {s.signOut}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200 h-14 flex items-center gap-2 px-4 lg:px-8 pt-[env(safe-area-inset-top)]">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label={s.openMenu}
            className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">{s.topBarTitle}</h1>
          <div className="flex-1" />
          <button
            type="button"
            aria-label={s.bellAria}
            className="relative w-9 h-9 inline-flex items-center justify-center text-gray-600 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
          >
            <Bell className="w-5 h-5" />
            {/* Static dot for now — backend hook in a later mission. */}
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-tribe-red rounded-full" />
          </button>
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
    </div>
  );
}
