'use client';

/**
 * Dashboard widget surfacing recent gym activity.
 *
 * Fetches GET /api/tribe-os/dashboard/recent-activity and renders the
 * most recent attendance events: who showed up, for which session,
 * when, and whether they paid. Each row links to the client's detail
 * page for follow-up.
 *
 * Three states:
 *   - loading — three skeleton rows
 *   - empty   — "no activity yet" hint (new gym / no attendance recorded)
 *   - has rows — vertical list, newest first
 *
 * Sister widget to AtRiskClientsWidget: same surface style, same
 * "loading / empty / ready" tri-state. Where at-risk surfaces the
 * negative signal ("who haven't I seen"), recent-activity surfaces
 * the positive one ("what's been happening").
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, ChevronRight, Check, X as XIcon, DollarSign } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { formatCents } from '@/lib/format/currency';
import type { Currency } from '@/lib/payments/config';

interface RecentActivityItem {
  id: string;
  client_id: string;
  client_name: string | null;
  session_id: string;
  session_title: string | null;
  session_sport: string | null;
  attended: boolean;
  paid: boolean;
  attended_at: string | null;
  amount_paid_cents: number | null;
  currency: string | null;
  created_at: string;
}

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: RecentActivityItem[] };

interface RecentActivityWidgetProps {
  /** Max rows to render. Defaults to 6 to keep the dashboard compact. */
  limit?: number;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Recent activity',
    subtitle: 'The latest check-ins and payments in your gym.',
    loading: 'Loading',
    error: 'Could not load recent activity.',
    emptyTitle: 'No activity yet',
    emptyHint: "Once you record attendance for a session, it'll show up here.",
    viewAll: 'See all clients',
    attended: 'Attended',
    noShow: 'No show',
    unknownClient: 'Client',
    unknownSession: 'Session',
    minutesAgo: (n: number) => (n === 1 ? '1 min ago' : `${n} min ago`),
    hoursAgo: (n: number) => (n === 1 ? '1 hr ago' : `${n} hr ago`),
    daysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),
    justNow: 'Just now',
  },
  es: {
    title: 'Actividad reciente',
    subtitle: 'Las últimas asistencias y pagos en tu gym.',
    loading: 'Cargando',
    error: 'No se pudo cargar la actividad reciente.',
    emptyTitle: 'Aún sin actividad',
    emptyHint: 'Cuando registres asistencia a una sesión, aparecerá aquí.',
    viewAll: 'Ver todos los clientes',
    attended: 'Asistió',
    noShow: 'No vino',
    unknownClient: 'Cliente',
    unknownSession: 'Sesión',
    minutesAgo: (n: number) => (n === 1 ? 'hace 1 min' : `hace ${n} min`),
    hoursAgo: (n: number) => (n === 1 ? 'hace 1 h' : `hace ${n} h`),
    daysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
    justNow: 'Justo ahora',
  },
} as const;

export default function RecentActivityWidget({ limit = 6 }: RecentActivityWidgetProps) {
  const { language } = useLanguage();
  const s = copy[language];

  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const url = new URL('/api/tribe-os/dashboard/recent-activity/', window.location.origin);
        url.searchParams.set('limit', String(limit));

        const res = await fetch(url.toString(), { method: 'GET' });
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { activity?: RecentActivityItem[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'ready', items: body.data.activity ?? [] });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <section className="bg-tribe-surface rounded-2xl border border-tribe-mid p-5 sm:p-6 mt-4">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-tribe-green shrink-0" />
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
      ) : state.items.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <p className="text-sm font-semibold text-white">{s.emptyTitle}</p>
          <p className="text-xs text-white/60 max-w-xs mx-auto leading-relaxed">{s.emptyHint}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {state.items.map((item) => (
            <ActivityRow key={item.id} item={item} copy={s} language={language} />
          ))}
        </ul>
      )}

      {state.kind === 'ready' && state.items.length > 0 ? (
        <div className="mt-4">
          <Link
            href="/os/clients"
            className="inline-flex items-center gap-1 text-xs font-semibold text-tribe-green hover:text-tribe-green/80 transition-colors"
          >
            {s.viewAll}
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Single row: clickable, links to the client detail page so the
 * instructor can drill into the attendance/payments history.
 */
function ActivityRow({
  item,
  copy: s,
  language,
}: {
  item: RecentActivityItem;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
}) {
  const clientName = item.client_name?.trim() || s.unknownClient;
  const sessionTitle = item.session_title?.trim() || item.session_sport?.trim() || s.unknownSession;
  const when = relativeTimeLabel(item.attended_at ?? item.created_at, s);
  const showPaid =
    item.paid &&
    item.amount_paid_cents != null &&
    item.amount_paid_cents > 0 &&
    (item.currency === 'USD' || item.currency === 'COP');

  return (
    <li>
      <Link
        href={`/os/clients/${item.client_id}`}
        className="flex items-center gap-3 p-3 bg-tribe-dark/40 rounded-lg border border-tribe-mid/60 hover:border-tribe-green/40 transition-colors"
      >
        {/* Attended badge — green check or muted X. The strongest
            at-a-glance signal: who showed and who didn't. */}
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            item.attended ? 'bg-tribe-green/20 text-tribe-green' : 'bg-tribe-mid text-white/40'
          }`}
          aria-label={item.attended ? s.attended : s.noShow}
        >
          {item.attended ? <Check className="w-4 h-4" /> : <XIcon className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{clientName}</p>
          <p className="text-[11px] text-white/55 truncate mt-0.5">{sessionTitle}</p>
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-[10px] text-white/50 uppercase tracking-wider">{when}</span>
          {showPaid ? (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-tribe-green">
              <DollarSign className="w-3 h-3" />
              {formatCents(item.amount_paid_cents ?? 0, item.currency as Currency, language)}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

/**
 * Friendly relative time: "Just now" (< 1 min), "N min ago" (< 60 min),
 * "N hr ago" (< 24 hr), then "N days ago". Past-only — we never display
 * future timestamps on this widget because all sources are historical.
 */
function relativeTimeLabel(iso: string | null, s: (typeof copy)['en'] | (typeof copy)['es']): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 0) return s.justNow;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return s.justNow;
  if (diffMin < 60) return s.minutesAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return s.hoursAgo(diffHr);
  const diffDay = Math.floor(diffHr / 24);
  return s.daysAgo(diffDay);
}
