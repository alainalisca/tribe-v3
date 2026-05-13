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
import { Activity } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';
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
    verbAttended: 'attended',
    verbPaid: 'paid for',
    verbMissed: 'missed',
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
    verbAttended: 'asistió a',
    verbPaid: 'pagó por',
    verbMissed: 'faltó a',
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
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <header className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="w-4 h-4 text-tribe-green shrink-0" />
          <h2 className="text-base font-bold text-gray-900 truncate">{s.title}</h2>
        </div>
      </header>

      {state.kind === 'loading' ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : state.kind === 'error' ? (
        <p className="text-sm text-gray-500 py-4 text-center">{s.error}</p>
      ) : state.items.length === 0 ? (
        <div className="py-6 text-center space-y-1">
          <p className="text-sm font-semibold text-gray-900">{s.emptyTitle}</p>
          <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">{s.emptyHint}</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {state.items.map((item) => (
            <ActivityRow key={item.id} item={item} copy={s} language={language} />
          ))}
        </ul>
      )}
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

  // Color dot encodes event type: green = paid attendance, blue =
  // attended (no payment), gray = no-show. Matches the colored dots
  // in the mockup's activity feed.
  const dotColor = item.paid ? 'bg-tribe-green' : item.attended ? 'bg-blue-400' : 'bg-gray-300';
  const verb = item.paid ? s.verbPaid : item.attended ? s.verbAttended : s.verbMissed;

  return (
    <li>
      <Link
        href={`/os/clients/${item.client_id}`}
        onClick={() =>
          trackEvent('tribe_os_recent_activity_clicked', {
            attended: item.attended,
            paid: item.paid,
          })
        }
        className="flex items-start gap-3 py-3 group"
      >
        <span className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 shrink-0`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900 group-hover:text-tribe-dark">
            <span className="font-semibold">{clientName}</span> <span className="text-gray-500">{verb}</span>{' '}
            <span className="font-medium">{sessionTitle}</span>
            {showPaid ? (
              <span className="text-tribe-green font-semibold">
                {' '}
                · {formatCents(item.amount_paid_cents ?? 0, item.currency as Currency, language)}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{when}</p>
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
