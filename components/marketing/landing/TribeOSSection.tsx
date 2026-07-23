'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { showError } from '@/lib/toast';
import { createClient } from '@/lib/supabase/client';
import TribeOSWaitlistCard from '@/components/tribe-os/TribeOSWaitlistCard';
import { isTribeOSPremiumActive, type TribeOSPremiumFields } from '@/lib/dal/tribeOSPremium';
import { logError } from '@/lib/logger';

type PremiumRow = Pick<TribeOSPremiumFields, 'tribe_os_tier' | 'tribe_os_status'>;

type AuthState = 'loading' | 'anon' | 'not_premium' | 'premium';

// English copy is the canonical source. Spanish strings below are starter-pack
// drafts pending Verónica's review; once she returns edits, replace the `es`
// block and remove the marker comment.
const t = {
  en: {
    eyebrow: 'Tribe.OS',
    headline: 'Run your fitness business inside Tribe.',
    sub: 'Tribe.OS is the premium tier for instructors and group leaders. Charge for your sessions, manage your clients, and grow your practice without leaving the app your community already uses.',
    reasonsHeading: 'Why instructors are joining',
    reasons: [
      {
        title: 'Charge for what you teach.',
        body: 'Take payments through Tribe with one tap from the participant. No second app, no separate sign-in.',
      },
      {
        title: 'Keep your client list in one place.',
        body: 'The people who show up to your free sessions today become your client base. Tribe.OS keeps them organized.',
      },
      {
        title: 'Grow beyond your WhatsApp group.',
        body: 'Every session you post reaches participants you have not met yet, in your sport, at your level, near you.',
      },
    ],
    // Waitlist (anon visitors)
    cardTitle: 'Join the Tribe.OS waitlist',
    cardSub:
      'Tell us about your work and the pricing model that would work for you. We will reach out as we open early access.',
    nameLabel: 'Your name',
    emailLabel: 'Email',
    teachLabel: 'What do you teach?',
    teachPh: 'Yoga, running, boxing, dance, BJJ',
    sessionsLabel: 'How many sessions do you run per week?',
    sessionsPh: 'For example, 5',
    pricingHeading: 'Which pricing model would work for you?',
    pricingMonthly: 'Thirty dollars per month for unlimited paid session creation.',
    pricingRevShare: 'Free to use. Tribe takes fifteen percent of paid session revenue.',
    commentsLabel: 'Anything else we should know?',
    commentsPh: 'Optional. Tell us about your practice, your clients, and what would help most.',
    submit: 'Join the waitlist',
    submitting: 'Saving your entry',
    successTitle: 'Thanks. You are on the list.',
    successSub:
      'We will reach out as Tribe.OS opens for early access. In the meantime, keep using the free Tribe app. Every session you post reaches participants you have not met yet.',
    pricingMissing: 'Pick the pricing model that works for you.',
    networkError: 'Something went wrong on our side. Please try again.',
    // Upgrade (signed-in, not premium)
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
    // Active (signed-in, premium)
    activeTitle: 'You are on Tribe.OS premium',
    activeSub:
      'Open your dashboard to manage clients, attendance, and payments. You can cancel or update billing anytime.',
    openDashboard: 'Open dashboard',
    managePortal: 'Manage subscription',
    portalLoading: 'Opening Stripe',
    portalError: 'Could not open Stripe portal. Please try again.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    eyebrow: 'Tribe.OS',
    headline: 'Gestiona tu negocio de fitness dentro de Tribe.',
    sub: 'Tribe.OS es el plan premium para instructores y líderes de grupo. Cobra por tus sesiones, gestiona a tus clientes y haz crecer tu práctica sin salir de la aplicación que tu comunidad ya usa.',
    reasonsHeading: 'Por qué los instructores se están uniendo',
    reasons: [
      {
        title: 'Cobra por lo que enseñas.',
        body: 'Recibe pagos a través de Tribe con un toque por parte del participante. Sin una segunda aplicación y sin un inicio de sesión separado.',
      },
      {
        title: 'Mantén tu lista de clientes en un solo lugar.',
        body: 'Las personas que asisten a tus sesiones gratuitas hoy se convierten en tu base de clientes. Tribe.OS los mantiene organizados.',
      },
      {
        title: 'Crece más allá de tu grupo de WhatsApp.',
        body: 'Cada sesión que publicas llega a participantes que aún no conoces, en tu deporte, en tu nivel, cerca de ti.',
      },
    ],
    cardTitle: 'Únete a la lista de espera de Tribe.OS',
    cardSub:
      'Cuéntanos sobre tu trabajo y el modelo de precios que funcionaría para ti. Te contactaremos cuando abramos el acceso anticipado.',
    nameLabel: 'Tu nombre',
    emailLabel: 'Correo electrónico',
    teachLabel: '¿Qué enseñas?',
    teachPh: 'Yoga, running, boxeo, baile, BJJ',
    sessionsLabel: '¿Cuántas sesiones realizas por semana?',
    sessionsPh: 'Por ejemplo, 5',
    pricingHeading: '¿Qué modelo de precios funcionaría para ti?',
    pricingMonthly: 'Treinta dólares al mes por la creación ilimitada de sesiones de pago.',
    pricingRevShare: 'Gratis de usar. Tribe toma el quince por ciento de los ingresos de las sesiones de pago.',
    commentsLabel: '¿Algo más que debamos saber?',
    commentsPh: 'Opcional. Cuéntanos sobre tu práctica, tus clientes y qué te ayudaría más.',
    submit: 'Únete a la lista de espera',
    submitting: 'Guardando tu entrada',
    successTitle: 'Gracias. Estás en la lista.',
    successSub:
      'Te contactaremos cuando Tribe.OS abra el acceso anticipado. Mientras tanto, sigue usando la aplicación Tribe gratuita. Cada sesión que publicas llega a participantes que aún no conoces.',
    pricingMissing: 'Elige el modelo de precios que funciona para ti.',
    networkError: 'Algo salió mal de nuestro lado. Por favor intenta de nuevo.',
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
    activeTitle: 'Tienes Tribe.OS premium',
    activeSub:
      'Abre tu panel para gestionar clientes, asistencias y pagos. Puedes cancelar o actualizar tu facturación cuando quieras.',
    openDashboard: 'Abrir panel',
    managePortal: 'Gestionar suscripción',
    portalLoading: 'Abriendo Stripe',
    portalError: 'No se pudo abrir el portal de Stripe. Por favor intenta de nuevo.',
  },
} as const;

export default function TribeOSSection() {
  const { language } = useLanguage();
  const s = t[language];
  const { ref, visible } = useScrollReveal(0.1);

  const [authState, setAuthState] = useState<AuthState>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setAuthState('anon');
        return;
      }
      // Audit E-4: a transient lookup failure here showed real premium
      // customers the public marketing CTA instead of their dashboard link.
      // Now: log the error, then treat as 'not_premium' so the page still
      // renders something — but at least the failure isn't invisible.
      const { data, error } = await supabase
        .from('users')
        .select('tribe_os_tier, tribe_os_status')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (error) {
        logError(error, { action: 'landing_premium_check', userId: user.id });
      }
      setAuthState(isTribeOSPremiumActive((data as PremiumRow | null) ?? null) ? 'premium' : 'not_premium');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="tribe-os" className="relative py-24 px-4 overflow-hidden bg-tribe-dark">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[1200px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(132,204,22,0.08) 0%, transparent 70%)' }}
        />
      </div>

      <div
        ref={ref}
        className={`relative z-10 max-w-6xl mx-auto transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-10 lg:gap-12 items-start">
          {/* Left column — pitch */}
          <div>
            <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">{s.eyebrow}</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-5">
              {s.headline}
            </h2>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed mb-8">{s.sub}</p>

            <h3 className="text-tribe-green uppercase tracking-[0.1em] text-xs font-semibold mb-4">
              {s.reasonsHeading}
            </h3>
            <ul className="space-y-5">
              {s.reasons.map((reason) => (
                <li key={reason.title} className="flex items-start gap-3">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-tribe-green shrink-0" />
                  <div>
                    <p className="text-base font-bold text-white mb-1">{reason.title}</p>
                    <p className="text-sm text-white/80 leading-relaxed">{reason.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Right column — content varies by auth state */}
          <div className="bg-white rounded-2xl p-7 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            {authState === 'loading' ? <LoadingPlaceholder /> : null}
            {/* Tribe.OS billing is disabled until launch (TRIBE_OS_BILLING_ENABLED),
                so a signed-in non-premium visitor gets the SAME waitlist form as an
                anonymous one rather than a Subscribe button that would 503. */}
            {authState === 'anon' || authState === 'not_premium' ? (
              <TribeOSWaitlistCard copy={s} language={language} />
            ) : null}
            {authState === 'premium' ? <ActiveCard copy={s} /> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-tribe-green border-t-transparent animate-spin" />
    </div>
  );
}

function ActiveCard({ copy: s }: { copy: typeof t.en | typeof t.es }) {
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePortal() {
    if (openingPortal) return;
    setOpeningPortal(true);
    setError(null);
    try {
      const res = await fetch('/api/tribe-os/subscription/portal/', { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; url?: string; error?: string };
      if (!res.ok || !body.success || !body.url) {
        const message = body.error || s.portalError;
        setError(message);
        showError(message);
        setOpeningPortal(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setError(s.portalError);
      showError(s.portalError);
      setOpeningPortal(false);
    }
  }

  return (
    <div className="text-center sm:text-left">
      <div className="w-14 h-14 mb-4 rounded-full bg-tribe-green flex items-center justify-center mx-auto sm:mx-0">
        <span className="text-tribe-dark text-2xl font-black">✓</span>
      </div>
      <h3 className="text-xl sm:text-2xl font-black text-tribe-dark mb-3">{s.activeTitle}</h3>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">{s.activeSub}</p>

      {error ? (
        <p className="text-sm text-red-600 mb-3" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2.5">
        <Link
          href="/os/dashboard"
          className="w-full inline-flex items-center justify-center px-5 py-3 bg-tribe-green text-tribe-dark text-base font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.35)] hover:-translate-y-0.5 transition-all"
        >
          {s.openDashboard}
        </Link>
        <button
          type="button"
          onClick={handlePortal}
          disabled={openingPortal}
          className="w-full inline-flex items-center justify-center px-5 py-3 bg-gray-100 text-tribe-dark text-base font-bold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {openingPortal ? `${s.portalLoading}…` : s.managePortal}
        </button>
      </div>
    </div>
  );
}
