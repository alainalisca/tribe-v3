'use client';

/**
 * Dashboard quick-stats — three numbers above the at-risk widget
 * showing the instructor their state at a glance: active clients,
 * sessions taught this month, and gross revenue this month.
 *
 * One round-trip to /api/tribe-os/dashboard/stats which fetches all
 * three in parallel server-side. Failures degrade gracefully: a
 * single failed query renders "—" for that stat rather than failing
 * the whole widget.
 *
 * Revenue collapses USD + COP into a single card when only one
 * currency has activity; when both have activity, shows both
 * stacked. Keeps the row to three cards on the typical
 * single-currency instructor view.
 */

import { useEffect, useState } from 'react';
import { Users, Calendar, DollarSign } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCents } from '@/lib/format/currency';

interface DashboardStatsData {
  active_clients_count: number | null;
  sessions_this_month: number | null;
  revenue_this_month: { USD?: number; COP?: number };
}

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: DashboardStatsData };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    activeClients: 'Active clients',
    sessionsThisMonth: 'Sessions this month',
    revenueThisMonth: 'Revenue this month',
    noRevenue: 'No revenue yet',
  },
  es: {
    activeClients: 'Clientes activos',
    sessionsThisMonth: 'Sesiones este mes',
    revenueThisMonth: 'Ingresos del mes',
    noRevenue: 'Aún sin ingresos',
  },
} as const;

export default function DashboardStats() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/dashboard/stats/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: DashboardStatsData;
          error?: string;
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
      <div className="grid grid-cols-3 gap-3 mb-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 bg-tribe-mid/40 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (state.kind === 'error') {
    // Silent degrade — if the stats fail to load, the rest of the
    // dashboard (at-risk widget, etc.) still works. Don't surface a
    // visible error here; the at-risk widget below has its own
    // error UI for stronger failures.
    return null;
  }

  const { data } = state;
  const revenue = revenueDisplay(data.revenue_this_month, language);

  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      <StatCard
        Icon={Users}
        label={s.activeClients}
        value={data.active_clients_count != null ? String(data.active_clients_count) : '—'}
      />
      <StatCard
        Icon={Calendar}
        label={s.sessionsThisMonth}
        value={data.sessions_this_month != null ? String(data.sessions_this_month) : '—'}
      />
      <StatCard Icon={DollarSign} label={s.revenueThisMonth} value={revenue ?? s.noRevenue} muted={revenue === null} />
    </div>
  );
}

function StatCard({
  Icon,
  label,
  value,
  muted = false,
}: {
  Icon: typeof Users;
  label: string;
  value: string;
  /** Dimmer styling for "no data yet" states. */
  muted?: boolean;
}) {
  return (
    <div className="bg-tribe-surface rounded-2xl border border-tribe-mid p-3 sm:p-4">
      <Icon className={`w-4 h-4 mb-1.5 ${muted ? 'text-white/30' : 'text-tribe-green'}`} />
      <p
        className={`text-lg sm:text-2xl font-black tracking-tight leading-none ${muted ? 'text-white/40' : 'text-white'}`}
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-white/50 mt-1 leading-tight">{label}</p>
    </div>
  );
}

/**
 * Returns the revenue value to display in the third card.
 *  - When both USD and COP have activity, prefer USD (most-common
 *    primary currency for this market) and add a "+COP" suffix.
 *  - When only one has activity, display that one alone.
 *  - When neither has activity, return null so the caller can render
 *    the "no revenue yet" copy.
 */
function revenueDisplay(rev: { USD?: number; COP?: number }, language: 'en' | 'es'): string | null {
  const hasUsd = rev.USD != null && rev.USD > 0;
  const hasCop = rev.COP != null && rev.COP > 0;
  if (!hasUsd && !hasCop) return null;
  if (hasUsd && hasCop) {
    return `${formatCents(rev.USD ?? 0, 'USD', language)} +${formatCents(rev.COP ?? 0, 'COP', language)}`;
  }
  if (hasUsd) return formatCents(rev.USD ?? 0, 'USD', language);
  return formatCents(rev.COP ?? 0, 'COP', language);
}
