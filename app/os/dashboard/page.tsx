'use client';

/**
 * /os/dashboard — Tribe.OS dashboard surface.
 *
 * Three viewer states:
 *   - anon:        middleware redirects to /auth?returnTo=
 *   - not_premium: upgrade pitch + Stripe Checkout
 *   - premium:     the dashboard proper
 *
 * Premium layout (matches mockup):
 *   - Greeting header: "Good morning, [name]" + one-liner subhead
 *   - KPI strip:       4 stat cards across the top
 *   - Two-column mid:  Upcoming Sessions (left, 2/3) + Members at Risk (right, 1/3)
 *   - Recent Activity: feed below
 *
 * This page deliberately does NOT use useTribeOSPremiumGate (which
 * redirects non-premium users away). The dashboard URL is the natural
 * landing surface for "I want Tribe.OS premium" intent — so we serve
 * the upgrade flow inline.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import TribeOSWaitlistCard from '@/components/tribe-os/TribeOSWaitlistCard';
import { useTranslations } from '@/lib/i18n/useTranslations';
import AtRiskClientsWidget from '@/components/tribe-os/AtRiskClientsWidget';
import CelebrateWinsWidget from '@/components/tribe-os/CelebrateWinsWidget';
import RecentActivityWidget from '@/components/tribe-os/RecentActivityWidget';
import TribeOSWelcomeGuide from '@/components/tribe-os/TribeOSWelcomeGuide';
import DashboardStats from '@/components/tribe-os/DashboardStats';
import OnboardingChecklist from '@/components/tribe-os/OnboardingChecklist';
import AuditActivityChip from '@/components/tribe-os/AuditActivityChip';
import DashboardTeamFilter from '@/components/tribe-os/DashboardTeamFilter';
import GymWeekRecapCard from '@/components/tribe-os/GymWeekRecapCard';
import UpcomingSessionsCard from '@/components/tribe-os/UpcomingSessionsCard';
import InsightsBanner from '@/components/tribe-os/InsightsBanner';
import RecentlyEndedSessionPrompt from '@/components/tribe-os/RecentlyEndedSessionPrompt';
import { getTribeOSPremiumStatusForUser } from '@/lib/dal/tribeOSPremium';
import { trackEvent } from '@/lib/analytics';

type PageState =
  | { kind: 'checking' }
  | { kind: 'redirecting' }
  | { kind: 'not_premium' }
  | { kind: 'error' }
  // Premium but not linked to a gym (legacy/CLI-granted owner). Checkout
  // always creates a gym now, so this is the legacy edge path. Without
  // this state the dashboard renders real-looking zeros (0 members, $0,
  // —% retention) which reads as "your gym is empty" rather than the
  // truth: there is no gym yet.
  | { kind: 'premium_no_gym'; firstName: string }
  | { kind: 'premium'; firstName: string };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    // Premium dashboard
    greetingMorning: (name: string) => `Good morning, ${name}`,
    greetingAfternoon: (name: string) => `Good afternoon, ${name}`,
    greetingEvening: (name: string) => `Good evening, ${name}`,
    greetingFallback: (name: string) => `Welcome back, ${name}`,
    subhead: "Here's what's happening with your gym today.",
    redirectingLabel: 'Redirecting',
    loadingLabel: 'Loading',
    errorTitle: 'Something went wrong',
    errorBody: "We couldn't load your dashboard. Please try again.",
    retryLabel: 'Retry',
    backToTribe: '← Back to Tribe',
    // Premium but no gym yet (legacy path)
    noGymTitle: 'Set up your gym',
    noGymBody:
      "Your account has Tribe.OS premium, but it isn't linked to a gym yet. Set up your gym to start tracking members, attendance, and revenue.",
    noGymCta: 'Set up my gym',
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
    portalError: 'Could not open Stripe portal. Please try again.',
  },
  es: {
    greetingMorning: (name: string) => `Buenos días, ${name}`,
    greetingAfternoon: (name: string) => `Buenas tardes, ${name}`,
    greetingEvening: (name: string) => `Buenas noches, ${name}`,
    greetingFallback: (name: string) => `Bienvenido de nuevo, ${name}`,
    subhead: 'Esto es lo que está pasando en tu gym hoy.',
    redirectingLabel: 'Redirigiendo',
    loadingLabel: 'Cargando',
    errorTitle: 'Algo salió mal',
    errorBody: 'No pudimos cargar tu panel. Por favor intenta de nuevo.',
    retryLabel: 'Reintentar',
    backToTribe: '← Volver a Tribe',
    noGymTitle: 'Configura tu gym',
    noGymBody:
      'Tu cuenta tiene Tribe.OS premium, pero aún no está vinculada a un gym. Configura tu gym para empezar a ver miembros, asistencia e ingresos.',
    noGymCta: 'Configurar mi gym',
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
    portalError: 'No se pudo abrir el portal de Stripe. Por favor intenta de nuevo.',
  },
} as const;

function pickGreeting(s: typeof copy.en | typeof copy.es, name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return s.greetingMorning(name);
  if (hour < 18) return s.greetingAfternoon(name);
  if (hour < 22) return s.greetingEvening(name);
  return s.greetingFallback(name);
}

export default function TribeOSDashboardPage() {
  const { language } = useLanguage();
  const tWaitlist = useTranslations('tribeOs.waitlist');
  const waitlistCopy = {
    cardTitle: tWaitlist('cardTitle'),
    cardSub: tWaitlist('cardSub'),
    nameLabel: tWaitlist('nameLabel'),
    emailLabel: tWaitlist('emailLabel'),
    teachLabel: tWaitlist('teachLabel'),
    teachPh: tWaitlist('teachPh'),
    sessionsLabel: tWaitlist('sessionsLabel'),
    sessionsPh: tWaitlist('sessionsPh'),
    pricingHeading: tWaitlist('pricingHeading'),
    pricingMonthly: tWaitlist('pricingMonthly'),
    pricingRevShare: tWaitlist('pricingRevShare'),
    commentsLabel: tWaitlist('commentsLabel'),
    commentsPh: tWaitlist('commentsPh'),
    submit: tWaitlist('submit'),
    submitting: tWaitlist('submitting'),
    successTitle: tWaitlist('successTitle'),
    successSub: tWaitlist('successSub'),
    pricingMissing: tWaitlist('pricingMissing'),
    networkError: tWaitlist('networkError'),
  };
  const s = copy[language];
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>({ kind: 'checking' });
  // Team scope shared by the at-risk + celebrate-wins widgets. The
  // DashboardTeamFilter component owns the picker; we hold the
  // selected id at the page level and thread it down so both widgets
  // always show the same scope.
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  // Replay-ref pattern: TribeOSWelcomeGuide owns its open-state via
  // useQuickGuide; this ref receives the `replay` function so a
  // "Take the tour again" affordance (in Settings or elsewhere) can
  // re-open it.
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
          setPageState({ kind: 'redirecting' });
          router.replace('/auth?returnTo=/os/dashboard/');
        }
        return;
      }
      // Premium decision via the gym-aware resolver (owned gym ->
      // coached gym -> legacy users row) — same source of truth as the
      // server gate and useTribeOSPremiumGate. Fails CLOSED: a
      // transient error shows a retry, never the paywall.
      const premium = await getTribeOSPremiumStatusForUser(supabase, user.id);
      if (cancelled) return;
      if (!premium.success) {
        setPageState({ kind: 'error' });
        return;
      }
      if (!premium.data?.active) {
        setPageState({ kind: 'not_premium' });
        return;
      }
      // Display-only name for the greeting. A failure here is non-blocking —
      // fall back to the email local-part, then "there". The email comes from
      // the auth session (auth.users), the caller's own address, so this no
      // longer reads public.users.email (T-SEC5).
      const { data: profile } = await supabase.from('users').select('name').eq('id', user.id).single();
      if (cancelled) return;
      const rawName = profile?.name ?? user.email?.split('@')[0] ?? 'there';
      const firstName = rawName.trim().split(/\s+/)[0] || rawName;
      // Premium via the legacy users.tribe_os_* path resolves with no
      // gym. Show a "set up your gym" prompt instead of misleading zeros.
      if (!premium.data.gymId) {
        setPageState({ kind: 'premium_no_gym', firstName });
        trackEvent('tribe_os_dashboard_viewed');
        return;
      }
      setPageState({ kind: 'premium', firstName });
      trackEvent('tribe_os_dashboard_viewed');
      if (typeof window !== 'undefined' && window.location.search.includes('subscribed=true')) {
        trackEvent('tribe_os_checkout_succeeded');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (pageState.kind === 'checking' || pageState.kind === 'redirecting') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-500 text-sm uppercase tracking-[0.1em]">
          {pageState.kind === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  if (pageState.kind === 'error') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <div className="text-center max-w-sm">
          <p className="text-lg font-bold text-gray-900 mb-1">{s.errorTitle}</p>
          <p className="text-sm text-gray-600 mb-5">{s.errorBody}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-tribe-green text-slate-900 font-bold text-sm hover:opacity-90 transition"
          >
            {s.retryLabel}
          </button>
          <div className="mt-5">
            <Link href="/" className="text-sm font-semibold text-gray-500 hover:text-tribe-dark transition-colors">
              {s.backToTribe}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (pageState.kind === 'not_premium') {
    return (
      <main className="px-4 py-12 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/"
            className="inline-block text-sm font-semibold text-gray-500 hover:text-tribe-dark mb-8 transition-colors"
          >
            {s.backToTribe}
          </Link>
          <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">{s.upgradeEyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.1] mb-4">
            {s.upgradeTitle}
          </h1>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-10">{s.upgradeIntro}</p>
          <div className="bg-white rounded-2xl p-7 sm:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-gray-200">
            {/* Billing is disabled until launch (TRIBE_OS_BILLING_ENABLED), so
                this captures intent instead of payment. Same form the public
                landing page uses. */}
            <TribeOSWaitlistCard copy={waitlistCopy} language={language} />
          </div>
        </div>
      </main>
    );
  }

  if (pageState.kind === 'premium_no_gym') {
    return (
      <main className="px-4 py-12 sm:py-20">
        <div className="max-w-2xl mx-auto">
          <Link
            href="/"
            className="inline-block text-sm font-semibold text-gray-500 hover:text-tribe-dark mb-8 transition-colors"
          >
            {s.backToTribe}
          </Link>
          <p className="text-tribe-green uppercase tracking-[0.1em] text-sm font-semibold mb-4">{s.upgradeEyebrow}</p>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.1] mb-4">
            {s.noGymTitle}
          </h1>
          <p className="text-base sm:text-lg text-gray-700 leading-relaxed mb-8">{s.noGymBody}</p>
          <Link
            href="/os/gym"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-tribe-green text-slate-900 font-bold text-sm hover:opacity-90 transition"
          >
            {s.noGymCta}
          </Link>
        </div>
      </main>
    );
  }

  // pageState.kind === 'premium'
  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Greeting + chip rail: chips render to the right of (or
            below on mobile) the greeting. Quiet by default — the
            audit chip self-hides when there's no new activity. */}
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">
              {pickGreeting(s, pageState.firstName)}
            </h1>
            <p className="text-sm text-gray-500 mt-1">{s.subhead}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap pt-1.5">
            {/* Team picker self-hides on single-team gyms — won't
                appear on most setups. When present, scopes both the
                at-risk widget and the celebrate-wins widget. */}
            <DashboardTeamFilter onChange={setSelectedTeamId} />
            <AuditActivityChip />
          </div>
        </header>

        {/* Onboarding checklist — auto-hides once graduated or dismissed. */}
        <OnboardingChecklist />

        {/* Time-critical prompt: a class just ended in the last few
            hours and the coach landed on the dashboard. Surface
            attendance recording BEFORE everything else because the
            window for accurate recall (and member-perception of the
            class as "tracked") shrinks fast. Self-hides when no
            session ended recently — so most pageloads don't see it. */}
        <RecentlyEndedSessionPrompt />

        {/* Insights nudge — surfaces active community_insights so coaches
            see "you have N alerts" before they scan stats/sessions.
            Hides itself when zero insights so we don't add empty noise. */}
        <InsightsBanner />

        {/* This-week vs last-week recap. Sits between the insights
            nudge and the monthly KPI strip because it's a faster-
            decaying signal — coaches scan it daily, the KPIs are
            "where are we for the month" cadence. Self-hides for
            brand-new gyms with zero attendance in both windows. */}
        <GymWeekRecapCard />

        {/* KPI strip */}
        <DashboardStats />

        {/* Two-column mid section: upcoming sessions (2/3 wide) +
            members at risk (1/3 wide). Stacks on smaller widths. */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <UpcomingSessionsCard />
          </div>
          <div>
            <AtRiskClientsWidget teamId={selectedTeamId} />
          </div>
        </div>

        {/* Celebrate-wins widget — mirror image of the at-risk widget.
            Self-hides when no members are on an active streak so an
            early-stage gym doesn't see a dead card. Sits before the
            activity feed because acting on a streak ("send congrats")
            is more time-sensitive than scanning historical events. */}
        <CelebrateWinsWidget teamId={selectedTeamId} />

        {/* Recent activity feed */}
        <RecentActivityWidget />
      </div>

      {/* Auto-shown on first visit for premium users; dismissible. */}
      <TribeOSWelcomeGuide
        enabled
        onReplayRef={(replay) => {
          replayWelcomeRef.current = replay;
        }}
      />
    </div>
  );
}
