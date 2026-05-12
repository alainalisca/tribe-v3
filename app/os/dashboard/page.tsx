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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard, Users, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { showError } from '@/lib/toast';
import { createClient } from '@/lib/supabase/client';
import UpgradeCard from '@/components/tribe-os/UpgradeCard';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';

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
      setPageState(isTribeOSPremiumActive(data as PremiumRow | null) ? 'premium' : 'not_premium');
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
      window.location.href = body.url;
      // No reset — page is navigating away.
    } catch {
      showError(s.portalError);
      setOpeningPortal(false);
    }
  }

  if (pageState === 'checking' || pageState === 'redirecting') {
    return (
      <main className="min-h-screen bg-tribe-dark flex items-center justify-center px-4">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {pageState === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  if (pageState === 'not_premium') {
    return (
      <main className="min-h-screen bg-tribe-dark px-4 py-16 sm:py-24">
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
  return (
    <main className="min-h-screen bg-tribe-dark px-4 py-16 sm:py-24">
      <div className="max-w-2xl mx-auto">
        <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">Tribe.OS</p>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-[1.1] mb-6">{s.welcome}</h1>
        <p className="text-base sm:text-lg text-white/80 leading-relaxed mb-10">{s.placeholder}</p>
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <Link
            href="/os/clients"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-tribe-green text-tribe-dark text-base font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.5)] hover:-translate-y-0.5 transition-all"
          >
            <Users className="w-4 h-4" />
            {s.clientsCta}
          </Link>
          <Link
            href="/os/revenue"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-tribe-surface text-white text-base font-bold rounded-lg hover:bg-tribe-mid transition-colors"
          >
            <TrendingUp className="w-4 h-4" />
            {s.revenueCta}
          </Link>
          <button
            type="button"
            onClick={handlePortal}
            disabled={openingPortal}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-tribe-surface text-white text-base font-bold rounded-lg hover:bg-tribe-mid transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <CreditCard className="w-4 h-4" />
            {openingPortal ? `${s.portalLoading}…` : s.portalCta}
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 bg-tribe-surface text-white text-base font-bold rounded-lg hover:bg-tribe-mid transition-colors"
          >
            {s.backLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
