'use client';

/**
 * Dashboard KPI strip — four cards across the top of /os/dashboard:
 *
 *   Total Members         · roster size with month-over-month delta
 *   Active Sessions       · sessions scheduled today
 *   Monthly Revenue       · gross this month with MoM delta (USD primary)
 *   Retention Rate        · % of last-month-active members still active
 *
 * One round-trip to /api/tribe-os/dashboard/stats which fetches all
 * inputs in parallel. Per-metric failures degrade gracefully — that
 * one card renders "—" rather than failing the whole row.
 *
 * Light-theme styling (white cards on gray-50 surface) to match the
 * Tribe.OS redesign.
 */

import { useEffect, useState } from 'react';
import { Users, Calendar, DollarSign, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCents } from '@/lib/format/currency';

interface DashboardStatsData {
  total_members: { current: number; prior: number } | null;
  active_sessions_today: { current: number } | null;
  monthly_revenue: {
    current: { USD?: number; COP?: number };
    prior: { USD?: number; COP?: number };
  } | null;
  retention_rate: { current: number | null; prior: number | null } | null;
}

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: DashboardStatsData };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    totalMembers: 'Total Members',
    activeSessions: 'Active Sessions',
    monthlyRevenue: 'Monthly Revenue',
    retentionRate: 'Retention Rate',
    thisMonthDelta: (n: number) => `+${n} this month`,
    thisMonthDeltaNeg: (n: number) => `${n} this month`,
    today: (n: number) => (n === 1 ? '1 today' : `${n} today`),
    vsLastMonth: 'vs last month',
    noPriorData: 'No prior month data',
  },
  es: {
    totalMembers: 'Total de miembros',
    activeSessions: 'Sesiones activas',
    monthlyRevenue: 'Ingresos del mes',
    retentionRate: 'Retención',
    thisMonthDelta: (n: number) => `+${n} este mes`,
    thisMonthDeltaNeg: (n: number) => `${n} este mes`,
    today: (n: number) => (n === 1 ? '1 hoy' : `${n} hoy`),
    vsLastMonth: 'vs mes pasado',
    noPriorData: 'Sin datos previos',
  },
} as const;

export default function DashboardStats() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/dashboard/stats/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: DashboardStatsData;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'ready', data: body.data });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-white rounded-xl border border-gray-200 animate-pulse" />
        ))}
      </div>
    );
  }

  if (state.kind === 'error') {
    return null;
  }

  const { data } = state;
  const totalDelta =
    data.total_members && data.total_members.prior > 0
      ? Math.round(((data.total_members.current - data.total_members.prior) / data.total_members.prior) * 1000) / 10
      : null;
  const totalAbs = data.total_members ? data.total_members.current - data.total_members.prior : null;

  const revenueCurrentUsd = data.monthly_revenue?.current.USD ?? 0;
  const revenuePriorUsd = data.monthly_revenue?.prior.USD ?? 0;
  const revenueDelta =
    revenuePriorUsd > 0 ? Math.round(((revenueCurrentUsd - revenuePriorUsd) / revenuePriorUsd) * 1000) / 10 : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        Icon={Users}
        label={s.totalMembers}
        value={data.total_members ? String(data.total_members.current) : '—'}
        delta={totalDelta}
        absoluteDelta={totalAbs}
        deltaHint={
          totalAbs != null ? (totalAbs >= 0 ? s.thisMonthDelta(totalAbs) : s.thisMonthDeltaNeg(totalAbs)) : null
        }
      />
      <KpiCard
        Icon={Calendar}
        label={s.activeSessions}
        value={data.active_sessions_today ? String(data.active_sessions_today.current) : '—'}
        delta={null}
        deltaHint={data.active_sessions_today ? s.today(data.active_sessions_today.current) : null}
      />
      <KpiCard
        Icon={DollarSign}
        label={s.monthlyRevenue}
        value={data.monthly_revenue ? formatCents(revenueCurrentUsd, 'USD', language) : '—'}
        delta={revenueDelta}
        deltaHint={revenueDelta != null ? s.vsLastMonth : data.monthly_revenue ? s.noPriorData : null}
      />
      <KpiCard
        Icon={TrendingUp}
        label={s.retentionRate}
        value={
          data.retention_rate && data.retention_rate.current != null
            ? `${data.retention_rate.current.toFixed(1)}%`
            : '—'
        }
        delta={null}
        deltaHint={data.retention_rate?.current != null ? s.vsLastMonth : null}
      />
    </div>
  );
}

/**
 * One KPI tile. Renders a colored icon chip top-right, large value
 * mid-card, and either a percentage delta with up/down arrow or a
 * plain hint string at the bottom.
 */
function KpiCard({
  Icon,
  label,
  value,
  delta,
  absoluteDelta,
  deltaHint,
}: {
  Icon: typeof Users;
  label: string;
  value: string;
  /** Percentage delta vs prior period; positive renders green up, negative red down. Null hides the indicator. */
  delta: number | null;
  /** Optional absolute delta the consumer wants surfaced (e.g. +12 members). */
  absoluteDelta?: number | null;
  /** Plain-text hint shown below the value when delta is null OR alongside it. */
  deltaHint: string | null;
}) {
  const showDelta = delta != null && Number.isFinite(delta);
  const isUp = showDelta && (delta as number) >= 0;
  const DeltaArrow = isUp ? ArrowUp : ArrowDown;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <div className="w-9 h-9 rounded-lg bg-tribe-green/15 text-tribe-dark flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900 leading-none mb-2">{value}</p>
      {showDelta || deltaHint ? (
        <div className="flex items-center gap-1 text-xs">
          {showDelta ? (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold ${isUp ? 'text-tribe-green' : 'text-tribe-red'}`}
            >
              <DeltaArrow className="w-3 h-3" />
              {Math.abs(delta as number).toFixed(1)}%
            </span>
          ) : null}
          {deltaHint ? <span className="text-gray-500">{deltaHint}</span> : null}
          {showDelta && absoluteDelta != null && !deltaHint ? (
            <span className="text-gray-500">
              {absoluteDelta >= 0 ? '+' : ''}
              {absoluteDelta}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
