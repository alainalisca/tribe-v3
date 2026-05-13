'use client';

/**
 * /os/dashboard
 *
 * Three states based on the viewer's auth + Tribe.OS premium status:
 *
 *   - anon: never reaches here (middleware redirects to /auth?returnTo=)
 *   - not_premium: render the upgrade card. Subscribing redirects to
 *     Stripe Checkout. After payment the success_url brings them back
 *     here as premium and they see the dashboard.
 *   - premium: render the dashboard (manage clients + manage subscription
 *     + back to Tribe).
 *
 * This page deliberately does NOT use useTribeOSPremiumGate (which
 * redirects non-premium users away). The dashboard URL is the natural
 * landing surface for "I want Tribe.OS premium" intent — so we serve
 * the upgrade flow inline here rather than bouncing the user back to
 * the marketing landing (which they may not even see, since signed-in
 * users hit the feed home not the marketing page).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, HelpCircle, Plus } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { showError } from '@/lib/toast';
import { createClient } from '@/lib/supabase/client';
import UpgradeCard from '@/components/tribe-os/UpgradeCard';
import AtRiskClientsWidget from '@/components/tribe-os/AtRiskClientsWidget';
import TribeOSWelcomeGuide from '@/components/tribe-os/TribeOSWelcomeGuide';
import DashboardStats from '@/components/tribe-os/DashboardStats';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';
import { trackEvent } from '@/lib/analytics';

type PremiumRow = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>;

type PageState = 'checking' | 'redirecting' | 'not_premium' | 'premium';

const copy = {
  en: {
    // Premium dashboard
    welcome: 'Your gym at a glance',
    placeholder:
      'Members below need a check-in. Use the nav above for the full client roster, revenue, coaches, or gym settings.',
    clientsCta: 'Manage clients',
    revenueCta: 'View revenue',
    coachesCta: 'Coaches',
    gymCta: 'Gym settings',
    portalCta: 'Manage subscription',
    portalLoading: 'Opening Stripe',
    portalError: 'Could not open Stripe portal. Please try again.',
    replayTour: 'Take the tour again',
    createSessionCta: 'Create a paid session',
    backLabel: 'Back to Tribe',
    redirectingLabel: 'Redirecting',
    loadingLabel: 'Loading',
    // Upgrade flow (signed-in, not premium)
    upgradeEyebrow: 'Tribe.OS',
    upgradeIntro:
      "You're not on Tribe.OS premium yet. Activate it to unlock client management, attendance tracking, and zero per-session platform fees.",
    upgradeTitle: 'Upgrade to Tribe.OS premium',
    upgradePrice: '$30 / month',
    upgradePriceHint: 'Cancel anytime.',
    upgradeBenefits: [
      'Charge for sessions with zero per-transaction platform fee.',
      'Manage clients, attendance, and payments in one place.',
      'Track revenue and grow your practice on the same app your community already uses.',
    ],
    subscribeButton: 'Subscribe',
    subscribingLabel: 'Redirecting to Stripe',
    subscribeError: 'Could not start checkout. Please try again.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    welcome: 'Tu gym de un vistazo',
    placeholder:
      'Los miembros de abajo necesitan seguimiento. Usa la navegación arriba para ver la lista completa de clientes, ingresos, entrenadores o la configuración del gym.',
    clientsCta: 'Gestionar clientes',
    revenueCta: 'Ver ingresos',
    coachesCta: 'Entrenadores',
    gymCta: 'Configuración del gym',
    portalCta: 'Gestionar suscripción',
    portalLoading: 'Abriendo Stripe',
    portalError: 'No se pudo abrir el portal de Stripe. Por favor intenta de nuevo.',
    replayTour: 'Ver el tour de nuevo',
    createSessionCta: 'Crear sesión pagada',
    backLabel: 'Volver a Tribe',
    redirectingLabel: 'Redirigiendo',
    loadingLabel: 'Cargando',
    upgradeEyebrow: 'Tribe.OS',
    upgradeIntro:
      'Aún no tienes Tribe.OS premium. Actívalo para acceder a gestión de clientes, seguimiento de asistencia y cero comisiones por sesión.',
    upgradeTitle: 'Activa Tribe.OS premium',
    upgradePrice: '$30 / mes',
    upgradePriceHint: 'Cancela cuando quieras.',
    upgradeBenefits: [
      'Cobra por tus sesiones sin comisión por transacción.',
      'Gestiona clientes, asistencias y pagos en un solo lugar.',
      'Sigue tus ingresos y haz crecer tu práctica en la misma app que tu comunidad ya usa.',
    ],
    subscribeButton: 'Suscribirme',
    subscribingLabel: 'Redirigiendo a Stripe',
    subscribeError: 'No se pudo iniciar el pago. Por favor intenta de nuevo.',
  },
} as const;

export default function TribeOSDashboardPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>('checking');
  const [openingPortal, setOpeningPortal] = useState(false);
  // Replay-ref pattern: the TribeOSWelcomeGuide owns its open-state
  // via useQuickGuide; this ref receives the `replay` function so a
  // "Take the tour again" button on the dashboard can re-open it.
  const replayWelcomeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setPageState('redirecting');
          router.replace('/auth?returnTo=/os/dashboard/');
        }
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        // Treat lookup failures as not-premium (fail closed) so the
        // user sees the upgrade flow rather than getting redirected
        // away from the page they intended to reach.
        setPageState('not_premium');
        return;
      }
      const isPremium = isTribeOSPremiumActive(data as PremiumRow | null);
      setPageState(isPremium ? 'premium' : 'not_premium');
      // Fire once per page mount on the premium path so we can build
      // the dashboard-views funnel. The not_premium path fires its
      // own event when the checkout flow surfaces (handled in
      // UpgradeCard).
      if (isPremium) {
        trackEvent('tribe_os_dashboard_viewed');
        // Stripe success_url is /os/dashboard?subscribed=true. If
        // we see it, the user just completed checkout — close the
        // funnel here regardless of which device they returned on.
        if (typeof window !== 'undefined' && window.location.search.includes('subscribed=true')) {
          trackEvent('tribe_os_checkout_succeeded');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handlePortal() {
    if (openingPortal) return;
    setOpeningPortal(true);
    try {
      const res = await fetch('/api/tribe-os/subscription/portal/', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
      if (!res.ok || !body.success || !body.url) {
        showError(body.error || s.portalError);
        setOpeningPortal(false);
        return;
      }
      trackEvent('tribe_os_portal_opened');
      window.location.href = body.url;
      // No reset — page is navigating away.
    } catch {
      showError(s.portalError);
      setOpeningPortal(false);
    }
  }

  if (pageState === 'checking' || pageState === 'redirecting') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {pageState === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  if (pageState === 'not_premium') {
    return (
      <main className="px-4 py-12 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">{s.upgradeEyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-[1.1] mb-4">
            {s.upgradeTitle}
          </h1>
          <p className="text-base sm:text-lg text-white/80 leading-relaxed mb-10">{s.upgradeIntro}</p>
          <div className="bg-white rounded-2xl p-7 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <UpgradeCard copy={s} />
          </div>
        </div>
      </main>
    );
  }

  // pageState === 'premium'
  //
  // The OS shell (app/os/layout.tsx) handles top-level navigation to
  // Clients, Revenue, Coaches, and Gym settings. This page focuses
  // on the welcome surface + the at-risk widget (the active signal)
  // + a single secondary action (manage subscription). Keeps the
  // landing visually quiet for an instructor coming back to check
  // who they need to follow up with.
  return (
    <main className="px-4 py-8 sm:py-12">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-[1.1] mb-3">{s.welcome}</h1>
        <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-6">{s.placeholder}</p>

        {/* Quick-stats row — active clients / sessions this month /
            revenue this month. One round-trip; failures degrade
            gracefully (silent hide vs blocking error). */}
        <DashboardStats />

        {/* At-risk clients widget — the primary signal on this page. */}
        <AtRiskClientsWidget />

        {/* Primary action — sessions are created via the regular
            Tribe /create flow, so we link there. New instructors
            wouldn't know to look outside /os/* for this. */}
        <div className="mt-6">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-tribe-green text-tribe-dark text-sm font-bold rounded-full shadow-[0_4px_20px_rgba(132,204,22,0.3)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {s.createSessionCta}
          </Link>
        </div>

        {/* Secondary actions tucked at the bottom so they don't compete
            with the at-risk widget. Manage subscription is the only
            action not already in the shell nav or the account menu;
            "Take the tour again" lets a user re-open the welcome
            guide they may have skipped on first visit. */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePortal}
            disabled={openingPortal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-tribe-surface text-white text-xs font-semibold rounded-full border border-tribe-mid hover:bg-tribe-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-3.5 h-3.5" />
            {openingPortal ? `${s.portalLoading}…` : s.portalCta}
          </button>
          <button
            type="button"
            onClick={() => replayWelcomeRef.current?.()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-tribe-surface text-white/70 text-xs font-semibold rounded-full border border-tribe-mid hover:bg-tribe-mid hover:text-white transition-colors"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {s.replayTour}
          </button>
        </div>
      </div>

      {/* Auto-shown on first visit for premium users; dismissible.
          The ref lets the "Take the tour again" button above
          re-trigger the guide without changing the seen flag. */}
      <TribeOSWelcomeGuide
        enabled
        onReplayRef={(replay) => {
          replayWelcomeRef.current = replay;
        }}
      />
    </main>
  );
}
