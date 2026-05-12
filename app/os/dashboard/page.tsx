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

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { showError } from '@/lib/toast';
import { createClient } from '@/lib/supabase/client';
import UpgradeCard from '@/components/tribe-os/UpgradeCard';
import AtRiskClientsWidget from '@/components/tribe-os/AtRiskClientsWidget';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';
import { trackEvent } from '@/lib/analytics';

type PremiumRow = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>;

type PageState = 'checking' | 'redirecting' | 'not_premium' | 'premium';

const copy = {
  en: {
    // Premium dashboard
    welcome: 'Welcome to Tribe.OS',
    placeholder:
      'You are one of our first design partners. The full Tribe.OS dashboard with paid sessions and revenue analytics is being built right now based on what you and a small group of other instructors are telling us. Client management is live below.',
    clientsCta: 'Manage clients',
    revenueCta: 'View revenue',
    coachesCta: 'Coaches',
    gymCta: 'Gym settings',
    portalCta: 'Manage subscription',
    portalLoading: 'Opening Stripe',
    portalError: 'Could not open Stripe portal. Please try again.',
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
    welcome: 'Bienvenido a Tribe.OS',
    placeholder:
      'Eres uno de nuestros primeros socios de diseño. El panel completo de Tribe.OS con sesiones de pago y analítica de ingresos se está construyendo ahora mismo con base en lo que tú y un grupo pequeño de instructores nos están diciendo. La gestión de clientes ya está disponible abajo.',
    clientsCta: 'Gestionar clientes',
    revenueCta: 'Ver ingresos',
    coachesCta: 'Entrenadores',
    gymCta: 'Configuración del gym',
    portalCta: 'Gestionar suscripción',
    portalLoading: 'Abriendo Stripe',
    portalError: 'No se pudo abrir el portal de Stripe. Por favor intenta de nuevo.',
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
        <p className="text-sm sm:text-base text-white/70 leading-relaxed mb-8">{s.placeholder}</p>

        {/* At-risk clients widget — the primary signal on this page. */}
        <AtRiskClientsWidget />

        {/* Secondary actions tucked at the bottom so they don't compete
            with the at-risk widget. Manage subscription is the only
            action not already in the shell nav or the account menu. */}
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handlePortal}
            disabled={openingPortal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-tribe-surface text-white text-xs font-semibold rounded-full border border-tribe-mid hover:bg-tribe-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-3.5 h-3.5" />
            {openingPortal ? `${s.portalLoading}…` : s.portalCta}
          </button>
        </div>
      </div>
    </main>
  );
}
