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
import { Users, Calendar, DollarSign, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCents } from '@/lib/format/currency';
import { StatCard } from '@/components/tribe-os/ui';

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-white rounded-tribe shadow-tribe animate-pulse" />
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

  // Build per-card hint strings up-front to keep the JSX below tidy.
  const membersHint =
    totalAbs != null ? (totalAbs >= 0 ? s.thisMonthDelta(totalAbs) : s.thisMonthDeltaNeg(totalAbs)) : undefined;
  const sessionsHint = data.active_sessions_today ? s.today(data.active_sessions_today.current) : undefined;
  const revenueHint = revenueDelta != null ? s.vsLastMonth : data.monthly_revenue ? s.noPriorData : undefined;
  const retentionHint = data.retention_rate?.current != null ? s.vsLastMonth : undefined;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard
        icon={Users}
        label={s.totalMembers}
        value={data.total_members ? String(data.total_members.current) : '—'}
        change={totalDelta ?? undefined}
        changeLabel={membersHint}
      />
      <StatCard
        icon={Calendar}
        label={s.activeSessions}
        value={data.active_sessions_today ? String(data.active_sessions_today.current) : '—'}
        change={undefined}
        changeLabel={sessionsHint}
      />
      <StatCard
        icon={DollarSign}
        label={s.monthlyRevenue}
        value={data.monthly_revenue ? formatCents(revenueCurrentUsd, 'USD', language) : '—'}
        change={revenueDelta ?? undefined}
        changeLabel={revenueHint}
      />
      <StatCard
        icon={TrendingUp}
        label={s.retentionRate}
        value={
          data.retention_rate && data.retention_rate.current != null
            ? `${data.retention_rate.current.toFixed(1)}%`
            : '—'
        }
        change={undefined}
        changeLabel={retentionHint}
      />
    </div>
  );
}
