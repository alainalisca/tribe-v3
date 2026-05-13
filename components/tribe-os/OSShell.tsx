'use client';

/**
 * Tribe.OS shell — persistent top navigation rendered on every
 * /os/* surface via app/os/layout.tsx.
 *
 * Why this exists: pre-shell, every OS surface was an island. You
 * had to go back to the dashboard between every action — four taps
 * to move from /os/clients to /os/gym, no visible "where am I" or
 * "what else exists in Tribe.OS" affordance. The shell collapses
 * that to one tap and surfaces the whole feature set at a glance.
 *
 * Structure:
 *   Left:   "Tribe.OS" wordmark, links back to /os/dashboard
 *   Center: four primary nav items (Panel, Clientes, Ingresos,
 *           Entrenadores), each highlighting when active
 *   Right:  account menu — gym settings, manage subscription,
 *           and a "back to Tribe" escape hatch
 *
 * Mobile: the center nav becomes a horizontal-scrollable row of
 * pills; the account menu collapses into a single icon-button that
 * opens a small overlay menu. Both layouts share the same brand
 * tokens as the rest of Tribe.OS (`tribe-dark`, `tribe-green`,
 * `tribe-mid`, `tribe-surface`).
 *
 * The page-level subtitles each existing page renders are unchanged;
 * the shell sits ABOVE them, so the existing per-page H1 still
 * provides the "what page am I on" signal at scroll-top.
 *
 * The shell does NOT include the page header — pages keep their
 * own H1 + subtitle. This is intentional so each surface can keep
 * its own breathing room and per-page actions without the shell
 * dictating layout. The shell is purely navigation.
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Building2, ChevronDown, Home, LogOut, Menu, TrendingUp, UserCog, Users } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';

type PremiumProbe = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>;

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    wordmark: 'Tribe.OS',
    nav: {
      dashboard: 'Dashboard',
      clients: 'Clients',
      revenue: 'Revenue',
      coaches: 'Coaches',
    },
    accountMenuLabel: 'Account',
    accountMenu: {
      gym: 'Gym settings',
      backToTribe: 'Back to Tribe',
    },
  },
  es: {
    wordmark: 'Tribe.OS',
    nav: {
      dashboard: 'Panel',
      clients: 'Clientes',
      revenue: 'Ingresos',
      coaches: 'Entrenadores',
    },
    accountMenuLabel: 'Cuenta',
    accountMenu: {
      gym: 'Configuración del gym',
      backToTribe: 'Volver a Tribe',
    },
  },
} as const;

interface NavItem {
  href: string;
  labelKey: keyof (typeof copy.en)['nav'];
  Icon: typeof Home;
  /**
   * Path prefix this nav item is considered active for. The
   * /os/clients item should be active when on /os/clients/*,
   * including detail and edit pages.
   */
  matchPrefix: string;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '/os/dashboard', labelKey: 'dashboard', Icon: Home, matchPrefix: '/os/dashboard' },
  { href: '/os/clients', labelKey: 'clients', Icon: Users, matchPrefix: '/os/clients' },
  { href: '/os/revenue', labelKey: 'revenue', Icon: TrendingUp, matchPrefix: '/os/revenue' },
  { href: '/os/coaches', labelKey: 'coaches', Icon: UserCog, matchPrefix: '/os/coaches' },
] as const;

function isActive(pathname: string | null, prefix: string): boolean {
  if (!pathname) return false;
  // Exact match OR child-route match (e.g. /os/clients/[id]/edit)
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Tracks whether the signed-in user is on Tribe.OS premium so the
 * shell can hide nav links that would just bounce them via
 * useTribeOSPremiumGate. Without this, a non-premium user lands on
 * /os/dashboard, sees the four nav pills, clicks one → marketing
 * page redirect. Worse UX than no nav at all.
 *
 * Three states:
 *   - 'unknown': initial probe in progress; render nav defensively
 *     so we don't flash a no-nav state to premium users on every
 *     page load.
 *   - 'premium': render the full nav.
 *   - 'not_premium': render only the wordmark + account menu. The
 *     dashboard page itself surfaces the upgrade card.
 */
type PremiumStatus = 'unknown' | 'premium' | 'not_premium';

export default function OSShell({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const s = copy[language];
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus>('unknown');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setPremiumStatus('not_premium');
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        // Fail closed — treat lookup errors as not-premium so we
        // don't accidentally surface nav to someone who'd just be
        // bounced. The page-level gate does the actual gating.
        setPremiumStatus('not_premium');
        return;
      }
      setPremiumStatus(isTribeOSPremiumActive(data as PremiumProbe | null) ? 'premium' : 'not_premium');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showNav = premiumStatus !== 'not_premium';

  return (
    <div className="min-h-screen bg-tribe-dark">
      {/* Sticky top bar. z-30 so it sits above page content but below
          modals/dialogs. pt-[env(safe-area-inset-top)] adds room
          for the iOS status bar / notch in Capacitor builds; the
          inset evaluates to 0 on the web so desktop is unaffected. */}
      <header className="sticky top-0 z-30 border-b border-tribe-mid/60 bg-tribe-dark/95 backdrop-blur supports-[backdrop-filter]:bg-tribe-dark/80 pt-[env(safe-area-inset-top)]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3 sm:gap-6">
          {/* Wordmark */}
          <Link
            href="/os/dashboard"
            className="flex items-center gap-1 text-sm font-black tracking-tight text-white shrink-0 hover:text-tribe-green transition-colors"
          >
            <span>Tribe</span>
            <span className="text-tribe-green">.OS</span>
          </Link>

          {/* Primary nav (desktop/tablet) — only rendered when the
              user is premium (or while we're still probing, to avoid
              a no-nav flash for premium users). Non-premium users
              see just the wordmark and the account menu's "Back to
              Tribe" escape.
              Hidden on mobile (sm:hidden inverse → hidden sm:flex)
              because the bottom tab bar at the foot of the screen
              handles mobile navigation more thumb-reachably. */}
          {showNav ? (
            <nav
              className="hidden sm:flex flex-1 min-w-0 overflow-x-auto scrollbar-none"
              aria-label={s.accountMenuLabel}
            >
              <ul className="flex items-center gap-1 sm:gap-2">
                {NAV_ITEMS.map((item) => {
                  const active = isActive(pathname, item.matchPrefix);
                  const label = s.nav[item.labelKey];
                  const Icon = item.Icon;
                  return (
                    <li key={item.href} className="shrink-0">
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-full transition-colors whitespace-nowrap ${
                          active
                            ? 'bg-tribe-green text-tribe-dark'
                            : 'text-white/70 hover:text-white hover:bg-tribe-surface'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : (
            <div className="hidden sm:block flex-1" />
          )}
          {/* Mobile spacer so the wordmark stays left-anchored and
              the account menu stays right-anchored when the desktop
              nav is hidden. */}
          <div className="sm:hidden flex-1" />

          {/* Account menu */}
          <AccountMenu
            open={accountOpen}
            setOpen={setAccountOpen}
            copy={s.accountMenu}
            label={s.accountMenuLabel}
            includeGymLink={premiumStatus === 'premium'}
          />
        </div>
      </header>

      {/* Page content. Pages render their own padding + max-width.
          pb-20 sm:pb-0 reserves room for the mobile bottom tab bar
          so content never gets hidden behind it. */}
      <div className="pb-20 sm:pb-0">{children}</div>

      {/* Mobile bottom tab bar — premium users only, same NAV_ITEMS
          as the desktop top nav. Fixed at the foot of the viewport
          with safe-area-inset-bottom so the iOS home-indicator gap
          doesn't make tabs feel cramped. Hidden on sm+ where the
          top nav takes over. */}
      {showNav ? (
        <nav
          aria-label={s.accountMenuLabel}
          className="sm:hidden fixed bottom-0 inset-x-0 z-30 border-t border-tribe-mid/60 bg-tribe-dark/95 backdrop-blur supports-[backdrop-filter]:bg-tribe-dark/80 pb-[env(safe-area-inset-bottom)]"
        >
          <ul className="grid grid-cols-4 h-16">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.matchPrefix);
              const label = s.nav[item.labelKey];
              const Icon = item.Icon;
              return (
                <li key={item.href} className="flex">
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors ${
                      active ? 'text-tribe-green' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${active ? 'stroke-[2.5]' : ''}`} />
                    <span>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * The `copy` prop here is `(typeof copy)['en' | 'es']['accountMenu']`
 * — TypeScript's `as const` narrows each branch to its literal text,
 * so the union of EN and ES values is a wider type than either alone.
 * Spelled out as plain string shapes to avoid the narrowing collision.
 */
function AccountMenu({
  open,
  setOpen,
  copy: c,
  label,
  includeGymLink,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  copy: { gym: string; backToTribe: string };
  label: string;
  /** Gym settings is a premium-only surface; hide for non-premium users. */
  includeGymLink: boolean;
}) {
  // Close the menu on Escape. Without this, keyboard users have no
  // way to dismiss the menu other than clicking the scrim.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs sm:text-sm font-semibold rounded-full text-white/70 hover:text-white hover:bg-tribe-surface transition-colors"
      >
        <Menu className="w-4 h-4" />
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <>
          {/* Click-outside scrim. Transparent; closes the menu. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* Menu panel */}
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-50 min-w-[220px] bg-tribe-surface border border-tribe-mid rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.4)] overflow-hidden"
          >
            {includeGymLink ? (
              <>
                <MenuItem href="/os/gym" Icon={Building2} label={c.gym} onClick={() => setOpen(false)} />
                <div className="h-px bg-tribe-mid/60" />
              </>
            ) : null}
            <MenuItem href="/" Icon={LogOut} label={c.backToTribe} onClick={() => setOpen(false)} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function MenuItem({
  href,
  Icon,
  label,
  onClick,
  hint,
}: {
  href: string;
  Icon: typeof Home;
  label: string;
  onClick: () => void;
  hint?: boolean;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-white hover:bg-tribe-mid transition-colors"
    >
      <Icon className={`w-4 h-4 shrink-0 ${hint ? 'text-white/50' : 'text-white/70'}`} />
      <span className={hint ? 'text-white/85' : ''}>{label}</span>
    </Link>
  );
}
