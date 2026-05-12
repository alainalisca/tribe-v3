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
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import type { RevenueSummary } from '@/lib/dal/revenue';
import SummaryCards from './_components/SummaryCards';
import EmptyState from './_components/EmptyState';

type FetchState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; summary: RevenueSummary };

interface Period {
  /** Inclusive ISO date (YYYY-MM-DD). */
  from: string;
  /** Inclusive ISO date (YYYY-MM-DD). */
  to: string;
  /** Human label for the current period selection. */
  label: string;
}

/** Formats a Date as YYYY-MM-DD in the given IANA timezone. */
function isoDateInTimezone(d: Date, timezone: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA renders YYYY-MM-DD natively.
  return fmt.format(d);
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function currentMonthPeriod(timezone: string, monthLabel: (m: number, y: number) => string): Period {
  const now = new Date();
  const todayIso = isoDateInTimezone(now, timezone);
  const [yearStr, monthStr] = todayIso.split('-');
  const firstOfMonthIso = `${yearStr}-${monthStr}-01`;
  return {
    from: firstOfMonthIso,
    to: todayIso,
    label: monthLabel(Number(monthStr), Number(yearStr)),
  };
}

function allTimePeriod(label: string): Period {
  // 2020 covers everything ever recorded for Tribe. Sufficient for "all time" UX.
  return { from: '2020-01-01', to: isoDateInTimezone(new Date(), browserTimezone()), label };
}

export default function RevenueDashboardPage(): JSX.Element {
  const { language } = useLanguage();
  const s = COPY[language];
  const gate = useTribeOSPremiumGate();

  const [timezone] = useState<string>(() => browserTimezone());
  const [period, setPeriod] = useState<Period>(() => currentMonthPeriod(timezone, (m, y) => s.monthYearLabel(m, y)));
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
      <main className="min-h-screen bg-tribe-dark flex items-center justify-center px-4">
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
    <main className="min-h-screen bg-tribe-dark px-4 py-10 sm:py-14">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/os/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {s.backToDashboard}
          </Link>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-1">{s.title}</h1>
          <p className="text-sm text-white/60">{period.label}</p>
        </div>

        {/* Content */}
        {fetchState.kind === 'loading' || fetchState.kind === 'idle' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="h-44 rounded-2xl bg-white/5 animate-pulse" />
            <div className="h-44 rounded-2xl bg-white/5 animate-pulse" />
          </div>
        ) : fetchState.kind === 'error' ? (
          <div className="rounded-2xl bg-tribe-card border border-red-500/30 p-8 text-center">
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
            alreadyAllTime={period.from === '2020-01-01'}
            onWiden={() => setPeriod(allTimePeriod(s.allTimeLabel))}
          />
        ) : (
          <>
            <SummaryCards totals={fetchState.summary.totals} currencyDefault={fetchState.summary.currency_default} />

            {/* Placeholders for Mission 4 (chart) and Mission 5 (table) */}
            <div className="mt-8 rounded-2xl bg-white/5 border border-white/10 border-dashed p-8 text-center text-white/40 text-sm">
              {s.chartPlaceholder}
            </div>
            <div className="mt-4 rounded-2xl bg-white/5 border border-white/10 border-dashed p-8 text-center text-white/40 text-sm">
              {s.tablePlaceholder}
            </div>
          </>
        )}
      </div>
    </main>
  );
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
    chartPlaceholder: 'Chart coming next',
    tablePlaceholder: 'Payment list coming next',
    monthYearLabel: (month: number, year: number) => {
      const monthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
      ];
      return `${monthNames[month - 1]} ${year}`;
    },
    allTimeLabel: 'All time',
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
    chartPlaceholder: 'Gráfico próximamente',
    tablePlaceholder: 'Lista de pagos próximamente',
    monthYearLabel: (month: number, year: number) => {
      const monthNames = [
        'enero',
        'febrero',
        'marzo',
        'abril',
        'mayo',
        'junio',
        'julio',
        'agosto',
        'septiembre',
        'octubre',
        'noviembre',
        'diciembre',
      ];
      return `${monthNames[month - 1]} ${year}`;
    },
    allTimeLabel: 'Todo el tiempo',
    errorGeneric: 'Algo salió mal al cargar los datos de ingresos.',
    errorNetwork: 'No se pudo conectar al servidor. Verifica tu conexión e intenta de nuevo.',
    errorPremiumRequired: 'Se requiere Tribe.OS premium para ver los datos de ingresos.',
    errorUnauthorized: 'Necesitas iniciar sesión para ver los datos de ingresos.',
  },
} as const;
