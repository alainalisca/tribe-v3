'use client';

/**
 * Dashboard widget surfacing at-risk clients.
 *
 * Fetches GET /api/tribe-os/clients/at-risk and renders up to N rows.
 * Three states the widget can be in:
 *   - loading   — skeleton placeholder
 *   - empty     — "no one to check in on" affirmation (the good state)
 *   - has rows  — vertical list, each a Link to /os/clients/[id]
 *
 * The widget mounts on /os/dashboard. It is intentionally narrow:
 * single column, list-style, no chart. The signal is "who haven't
 * I seen lately"; richer analytics (cohort retention, drop-off
 * funnel) is post-beta work.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { AtRiskClient } from '@/lib/dal/clients';

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; clients: AtRiskClient[] };

interface AtRiskClientsWidgetProps {
  /** Days-since-last-seen threshold. Defaults to 14. */
  thresholdDays?: number;
  /** Max rows to show. Defaults to 5 (dashboard surface is narrow). */
  limit?: number;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Members to check in on',
    subtitle: "Clients you haven't seen lately, or marked as lapsed.",
    loading: 'Loading',
    error: 'Could not load this list.',
    emptyTitle: 'Nobody to check in on',
    emptyHint: 'Every active client has been seen recently. Nice work.',
    viewAll: 'See all clients',
    daysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),
    neverSeen: 'Never attended',
    statusLapsed: 'Lapsed',
    statusLead: 'Lead',
  },
  es: {
    title: 'Miembros para hacer seguimiento',
    subtitle: 'Clientes que no has visto últimamente o marcados como suspendidos.',
    loading: 'Cargando',
    error: 'No se pudo cargar esta lista.',
    emptyTitle: 'Nadie pendiente',
    emptyHint: 'Has visto a todos tus clientes activos recientemente. Buen trabajo.',
    viewAll: 'Ver todos los clientes',
    daysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
    neverSeen: 'Nunca asistió',
    statusLapsed: 'Suspendido',
    statusLead: 'Prospecto',
  },
} as const;

export default function AtRiskClientsWidget({ thresholdDays = 14, limit = 5 }: AtRiskClientsWidgetProps) {
  const { language } = useLanguage();
  const s = copy[language];

  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const url = new URL('/api/tribe-os/clients/at-risk/', window.location.origin);
        url.searchParams.set('thresholdDays', String(thresholdDays));
        url.searchParams.set('limit', String(limit));

        const res = await fetch(url.toString(), { method: 'GET' });
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: AtRiskClient[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'ready', clients: body.data ?? [] });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [thresholdDays, limit]);

  return (
    <section className="bg-tribe-surface rounded-2xl border border-tribe-mid p-5 sm:p-6">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-tribe-amber shrink-0" />
          <h2 className="text-base sm:text-lg font-bold text-white truncate">{s.title}</h2>
        </div>
      </header>
      <p className="text-xs sm:text-sm text-white/60 mb-4 leading-relaxed">{s.subtitle}</p>

      {state.kind === 'loading' ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 bg-tribe-mid/40 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : state.kind === 'error' ? (
        <p className="text-sm text-white/60 py-4 text-center">{s.error}</p>
      ) : state.clients.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <p className="text-sm font-semibold text-white">{s.emptyTitle}</p>
          <p className="text-xs text-white/60">{s.emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {state.clients.map((c) => (
            <AtRiskRow key={c.id} client={c} copy={s} />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Link
          href="/os/clients"
          className="inline-flex items-center gap-1 text-xs font-semibold text-tribe-green hover:text-tribe-green/80 transition-colors"
        >
          {s.viewAll}
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </section>
  );
}

function AtRiskRow({ client, copy: s }: { client: AtRiskClient; copy: typeof copy.en | typeof copy.es }) {
  const subtitle =
    client.status === 'lapsed'
      ? s.statusLapsed
      : client.days_since_last_seen != null
        ? s.daysAgo(client.days_since_last_seen)
        : client.status === 'lead'
          ? s.statusLead
          : s.neverSeen;

  return (
    <li>
      <Link
        href={`/os/clients/${client.id}`}
        className="flex items-center gap-3 p-3 bg-tribe-dark/30 rounded-lg border border-tribe-mid/60 hover:border-tribe-green/40 hover:bg-tribe-dark/50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{client.name}</p>
          <p className="text-xs text-white/60 mt-0.5 truncate">{subtitle}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-white/40 shrink-0" />
      </Link>
    </li>
  );
}
