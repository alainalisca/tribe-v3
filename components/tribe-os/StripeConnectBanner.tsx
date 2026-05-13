'use client';

/**
 * StripeConnectBanner — surfaces on /os/revenue when the gym owner
 * hasn't finished Stripe Connect onboarding.
 *
 * Problem: a new premium gym opens /os/revenue, sees $0 across the
 * board, and has no idea why — nothing on the page tells them they
 * need to connect Stripe to start accepting payments. This banner
 * makes that explicit + provides a direct CTA into the existing
 * onboarding flow at /earnings/payout-settings.
 *
 * Render states:
 *   - loading       → nothing (avoids flash; the page already has
 *                     skeletons for the rest of its content)
 *   - complete      → nothing (revenue is working as intended)
 *   - in_progress   → "Finish setup" CTA — Stripe link expired or
 *                     they stepped away mid-flow
 *   - not_started   → "Connect Stripe to accept payments" CTA
 *
 * Hides itself silently when the status probe fails — better than
 * a permanent "couldn't check" banner cluttering the page.
 *
 * Spanish copy is pending Verónica's review.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CreditCard, ChevronRight, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';

type State =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'not_started' }
  | { kind: 'in_progress'; requirements: string[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    notStartedTitle: 'Connect Stripe to accept payments',
    notStartedBody:
      'Your revenue dashboard stays at zero until you finish setup. It takes about 5 minutes and unlocks paid sessions.',
    inProgressTitle: 'Finish your Stripe setup',
    inProgressBody:
      'Stripe needs a few more details before they can release payouts. Picking up where you left off is fast.',
    cta: 'Open setup',
  },
  es: {
    notStartedTitle: 'Conecta Stripe para aceptar pagos',
    notStartedBody:
      'Tu panel de ingresos seguirá en cero hasta terminar la configuración. Toma unos 5 minutos y activa las sesiones pagadas.',
    inProgressTitle: 'Termina la configuración de Stripe',
    inProgressBody: 'Stripe necesita unos detalles más antes de liberar los pagos. Retomar donde lo dejaste es rápido.',
    cta: 'Abrir configuración',
  },
} as const;

export default function StripeConnectBanner() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/stripe/connect/status', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          state?: 'not_started' | 'in_progress' | 'complete';
          requirements_due?: string[];
        };
        if (cancelled) return;
        if (!res.ok || !body.success) {
          // Silent hide on probe error — better than a broken banner.
          setState({ kind: 'hidden' });
          return;
        }
        if (body.state === 'complete') {
          setState({ kind: 'hidden' });
          return;
        }
        if (body.state === 'in_progress') {
          setState({ kind: 'in_progress', requirements: body.requirements_due ?? [] });
          return;
        }
        setState({ kind: 'not_started' });
      } catch {
        if (!cancelled) setState({ kind: 'hidden' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading' || state.kind === 'hidden') return null;

  const isInProgress = state.kind === 'in_progress';
  const title = isInProgress ? s.inProgressTitle : s.notStartedTitle;
  const body = isInProgress ? s.inProgressBody : s.notStartedBody;

  return (
    <Link
      href="/earnings/payout-settings"
      onClick={() =>
        trackEvent('tribe_os_revenue_viewed', {
          stripe_state: state.kind,
        })
      }
      // The whole banner is a link — coaches clicking anywhere on it
      // land on the onboarding surface. Mirrors the InsightsBanner
      // pattern on /os/dashboard.
      className={`flex items-center justify-between gap-3 mb-4 rounded-xl border px-4 py-3 transition-colors group ${
        isInProgress
          ? 'bg-tribe-warning/10 border-tribe-warning/30 hover:bg-tribe-warning/15'
          : 'bg-tribe-info/10 border-tribe-info/30 hover:bg-tribe-info/15'
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
            isInProgress ? 'bg-tribe-warning/20 text-tribe-warning' : 'bg-tribe-info/20 text-tribe-info'
          }`}
        >
          {isInProgress ? <AlertCircle className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{body}</p>
        </div>
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-700 group-hover:text-gray-900 shrink-0">
        <span className="hidden sm:inline">{s.cta}</span>
        <ChevronRight className="w-4 h-4" />
      </span>
    </Link>
  );
}
