'use client';

/**
 * /os/revenue
 *
 * Tribe.OS premium creator's revenue dashboard. Shows per-currency
 * gross / fee / refund / net totals for a selected period, with a
 * placeholder for the time-series chart (Mission 4) and the payment
 * table (Mission 5).
 *
 * Premium-gated via useTribeOSPremiumGate. Non-premium users are
 * redirected to /#tribe-os (the waitlist anchor on the home page).
 *
 * Default period is "this month" in the instructor's local timezone.
 * The period selector arrives in Mission 4 — for now we expose a
 * minimal control so the data fetch can be retried after an error.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import type { RevenueSummary } from '@/lib/dal/revenue';
import SummaryCards from './_components/SummaryCards';
import EmptyState from './_components/EmptyState';
import PeriodSelector from './_components/PeriodSelector';
import RevenueChart from './_components/RevenueChart';
import PaymentTable from './_components/PaymentTable';
import ExportButton from './_components/ExportButton';
import { allTimePeriod, browserTimezone, thisMonthPeriod, type Period } from './_lib/periods';

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; summary: RevenueSummary };

export default function RevenueDashboardPage(): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];
  const gate = useTribeOSPremiumGate();

  const [timezone] = useState<string>(() => browserTimezone());
  const [period, setPeriod] = useState<Period>(() => thisMonthPeriod(timezone, language));
  const [fetchState, setFetchState] = useState<FetchState>({ kind: 'idle' });

  const fetchSummary = useCallback(
    async (p: Period) => {
      setFetchState({ kind: 'loading' });
      try {
        const url = `/api/tribe-os/revenue/summary?from=${p.from}&to=${p.to}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: RevenueSummary;
          error?: string;
        };
        if (!res.ok || !body.success || !body.data) {
          const msg = body.error ? translateError(body.error, s) : s.errorGeneric;
          setFetchState({ kind: 'error', message: msg });
          return;
        }
        setFetchState({ kind: 'ready', summary: body.data });
        // Fire once per successful summary fetch. Properties tell us
        // which currency lane the user is on + whether they have data
        // in the period, without leaking amounts.
        trackEvent('tribe_os_revenue_viewed', {
          period_days: rangeDaysApprox(p.from, p.to),
          group_by: body.data.group_by,
          currency_default: body.data.currency_default,
          has_usd: Boolean(body.data.totals.USD),
          has_cop: Boolean(body.data.totals.COP),
          bucket_count: body.data.buckets.length,
        });
      } catch {
        setFetchState({ kind: 'error', message: s.errorNetwork });
      }
    },
    [s]
  );

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    fetchSummary(period);
  }, [gate.state, period, fetchSummary]);

  // Gate states render their own loading / redirecting UI.
  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirecting : s.loading}…
        </p>
      </main>
    );
  }

  const isEmpty =
    fetchState.kind === 'ready' &&
    Object.keys(fetchState.summary.totals).length === 0 &&
    fetchState.summary.buckets.length === 0;

  return (
    <main className="px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-1">{s.title}</h1>
          <p className="text-sm text-white/60">{period.label}</p>
        </div>

        {/* Period selector + export */}
        <div className="mb-8 flex items-start justify-between gap-3 flex-wrap">
          <PeriodSelector value={period} onChange={setPeriod} timezone={timezone} />
          {fetchState.kind === 'ready' && !isEmpty && <ExportButton period={period} />}
        </div>

        {/* Content */}
        {fetchState.kind === 'loading' || fetchState.kind === 'idle' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-44 rounded-2xl bg-white/5 animate-pulse" />
            <div className="h-44 rounded-2xl bg-white/5 animate-pulse" />
          </div>
        ) : fetchState.kind === 'error' ? (
          <div className="rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.25)] border border-red-300 p-8 text-center">
            <p className="text-tribe-dark font-semibold mb-4">{fetchState.message}</p>
            <button
              type="button"
              onClick={() => fetchSummary(period)}
              className="inline-flex items-center justify-center px-5 py-2 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg hover:-translate-y-0.5 transition-transform"
            >
              {s.retry}
            </button>
          </div>
        ) : isEmpty ? (
          <EmptyState
            alreadyAllTime={period.preset === 'all_time'}
            onWiden={() => setPeriod(allTimePeriod(timezone, language))}
          />
        ) : (
          <>
            <SummaryCards totals={fetchState.summary.totals} currencyDefault={fetchState.summary.currency_default} />

            <div className="mt-8">
              <RevenueChart
                buckets={fetchState.summary.buckets}
                currencyDefault={fetchState.summary.currency_default}
                groupBy={fetchState.summary.group_by}
              />
            </div>

            <div className="mt-6">
              <PaymentTable period={period} timezone={timezone} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/**
 * Coarse day count between two YYYY-MM-DD strings, inclusive on both
 * ends. Used only as an analytics property (bucketing into "this
 * month", "last 90 days", etc.) so we don't need timezone correctness.
 */
function rangeDaysApprox(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(1, Math.round((to - from) / (24 * 60 * 60 * 1000)) + 1);
}

function translateError(code: string, s: (typeof COPY)[keyof typeof COPY]): string {
  switch (code) {
    case 'premium_required':
      return s.errorPremiumRequired;
    case 'unauthorized':
      return s.errorUnauthorized;
    default:
      return s.errorGeneric;
  }
}

const COPY = {
  en: {
    title: 'Revenue',
    backToDashboard: 'Back to Tribe.OS',
    loading: 'Loading',
    redirecting: 'Redirecting',
    retry: 'Retry',
    errorGeneric: 'Something went wrong loading revenue data.',
    errorNetwork: 'Could not reach the server. Check your connection and try again.',
    errorPremiumRequired: 'Tribe.OS premium is required to see revenue data.',
    errorUnauthorized: 'You need to sign in to see revenue data.',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    title: 'Ingresos',
    backToDashboard: 'Volver a Tribe.OS',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    retry: 'Reintentar',
    errorGeneric: 'Algo salió mal al cargar los datos de ingresos.',
    errorNetwork: 'No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.',
    errorPremiumRequired: 'Se requiere Tribe.OS premium para ver los datos de ingresos.',
    errorUnauthorized: 'Necesitas iniciar sesión para ver los datos de ingresos.',
  },
} as const;
