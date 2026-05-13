'use client';

/**
 * Dashboard widget surfacing recent gym activity.
 *
 * Fetches GET /api/tribe-os/dashboard/recent-activity which returns a
 * discriminated stream of two event kinds — attendance check-ins and
 * AI insights — merged by created_at desc.
 *
 *   Attendance rows: "Anna attended Sunday CrossFit · 2 min ago"
 *   Insight rows:    "AI flagged Carlos as at-risk · just now"
 *
 * Three states:
 *   - loading — three skeleton rows
 *   - empty   — "no activity yet" hint (new gym / no attendance recorded)
 *   - has rows — vertical list, newest first
 *
 * Sister widget to AtRiskClientsWidget: same surface style, same
 * "loading / empty / ready" tri-state. Where at-risk surfaces the
 * negative signal ("who haven't I seen"), recent-activity surfaces
 * the chronological narrative ("what's been happening, both human
 * and AI-derived").
 *
 * Why merge insights into this widget vs. building a parallel one:
 * a single feed reads the way coaches actually think about their gym
 * — temporal narrative trumps category. The insights banner above
 * the KPI strip already covers "you have N alerts"; this widget
 * threads them in alongside the rest of the day's events.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, Brain } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/tribe-os/ui';
import { trackEvent } from '@/lib/analytics';
import { formatCents } from '@/lib/format/currency';
import type { Currency } from '@/lib/payments/config';

interface AttendanceActivityItem {
  kind: 'attendance';
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

interface InsightActivityItem {
  kind: 'insight';
  id: string;
  insight_type: 'CHURN_RISK' | 'RETENTION_OPP' | 'REVENUE' | 'GROWTH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  headline: string;
  primary_member_id: string | null;
  primary_member_name: string | null;
  member_count: number;
  created_at: string;
}

type RecentActivityItem = AttendanceActivityItem | InsightActivityItem;

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: RecentActivityItem[] };

interface RecentActivityWidgetProps {
  /** Max rows to render. Defaults to 6 to keep the dashboard compact. */
  limit?: number;
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Recent activity',
    subtitle: 'The latest check-ins, payments, and AI signals.',
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
    insightLabelByType: {
      CHURN_RISK: 'AI flagged churn risk',
      RETENTION_OPP: 'AI retention opportunity',
      REVENUE: 'AI revenue signal',
      GROWTH: 'AI growth signal',
    },
    insightSubjectMulti: (n: number) => `${n} members affected`,
    minutesAgo: (n: number) => (n === 1 ? '1 min ago' : `${n} min ago`),
    hoursAgo: (n: number) => (n === 1 ? '1 hr ago' : `${n} hr ago`),
    daysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),
    justNow: 'Just now',
  },
  es: {
    title: 'Actividad reciente',
    subtitle: 'Las últimas asistencias, pagos y señales de IA.',
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
    insightLabelByType: {
      CHURN_RISK: 'IA: riesgo de abandono',
      RETENTION_OPP: 'IA: oportunidad de retención',
      REVENUE: 'IA: señal de ingresos',
      GROWTH: 'IA: señal de crecimiento',
    },
    insightSubjectMulti: (n: number) => `${n} miembros afectados`,
    minutesAgo: (n: number) => (n === 1 ? 'hace 1 min' : `hace ${n} min`),
    hoursAgo: (n: number) => (n === 1 ? 'hace 1 h' : `hace ${n} h`),
    daysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
    justNow: 'Justo ahora',
  },
} as const;

// Severity → dot color. CRITICAL is red, HIGH is amber, MEDIUM is
// info blue, LOW is muted gray. Matches the dot scheme used on the
// dashboard insights banner so users build a consistent visual model.
const SEVERITY_DOT: Record<InsightActivityItem['severity'], string> = {
  CRITICAL: 'bg-tribe-danger',
  HIGH: 'bg-tribe-warning',
  MEDIUM: 'bg-tribe-info',
  LOW: 'bg-tribe-dark-60',
};

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="w-4 h-4 text-tribe-green-dark shrink-0" />
          {s.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {state.kind === 'loading' ? (
          <div className="px-6 py-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 bg-tribe-dark-40 rounded-tribe animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'error' ? (
          <p className="text-sm text-tribe-dark-80 py-6 px-6 text-center">{s.error}</p>
        ) : state.items.length === 0 ? (
          <div className="py-6 px-6 text-center space-y-1">
            <p className="text-sm font-semibold text-tribe-dark">{s.emptyTitle}</p>
            <p className="text-xs text-tribe-dark-80 max-w-xs mx-auto leading-relaxed">{s.emptyHint}</p>
          </div>
        ) : (
          <div className="divide-y divide-tribe-dark-40">
            {state.items.map((item) =>
              item.kind === 'attendance' ? (
                <AttendanceRow key={`a-${item.id}`} item={item} copy={s} language={language} />
              ) : (
                <InsightRow key={`i-${item.id}`} item={item} copy={s} />
              )
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Attendance row — green dot for paid, blue dot for attended-only,
 * gray for no-show. Click links to the client detail page.
 */
function AttendanceRow({
  item,
  copy: s,
  language,
}: {
  item: AttendanceActivityItem;
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
  const dotColor = item.paid ? 'bg-tribe-green' : item.attended ? 'bg-tribe-info' : 'bg-tribe-dark-60';
  const verb = item.paid ? s.verbPaid : item.attended ? s.verbAttended : s.verbMissed;

  return (
    <div>
      <Link
        href={`/os/clients/${item.client_id}`}
        onClick={() =>
          trackEvent('tribe_os_recent_activity_clicked', {
            attended: item.attended,
            paid: item.paid,
          })
        }
        className="flex items-start gap-3 px-6 py-3 hover:bg-tribe-dark-40 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${dotColor} mt-1.5 shrink-0`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-tribe-dark">
            <span className="font-semibold">{clientName}</span> <span className="text-tribe-dark-80">{verb}</span>{' '}
            <span className="font-medium">{sessionTitle}</span>
            {showPaid ? (
              <span className="text-tribe-green-dark font-semibold">
                {' '}
                · {formatCents(item.amount_paid_cents ?? 0, item.currency as Currency, language)}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-tribe-dark-60 mt-0.5">{when}</p>
        </div>
      </Link>
    </div>
  );
}

/**
 * Insight row — severity-colored dot, brain icon, type label,
 * headline preview. Click links to /os/intelligence when the insight
 * spans multiple members (the full breakdown lives there), or to the
 * member detail page when there's a clear single subject.
 */
function InsightRow({ item, copy: s }: { item: InsightActivityItem; copy: typeof copy.en | typeof copy.es }) {
  const when = relativeTimeLabel(item.created_at, s);
  const typeLabel = s.insightLabelByType[item.insight_type];
  // Subject line: prefer the single primary member, fall back to the
  // generic "N members affected" copy when there's a group. Insights
  // with zero linked members show just the type label + headline.
  const subject = item.primary_member_id
    ? item.primary_member_name?.trim() || s.unknownClient
    : item.member_count > 1
      ? s.insightSubjectMulti(item.member_count)
      : null;
  // Route: deep-link to the member when we have one clear subject,
  // otherwise punt to /os/intelligence where the coach can see the
  // full card + action button.
  const href =
    item.primary_member_id && item.member_count === 1 ? `/os/clients/${item.primary_member_id}` : '/os/intelligence';

  return (
    <div>
      <Link
        href={href}
        onClick={() =>
          trackEvent('tribe_os_recent_activity_clicked', {
            kind: 'insight',
            severity: item.severity,
          })
        }
        className="flex items-start gap-3 px-6 py-3 hover:bg-tribe-dark-40 transition-colors"
      >
        <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT[item.severity]} mt-1.5 shrink-0`} aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-tribe-dark flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-tribe-green-dark shrink-0" aria-hidden="true" />
            <span className="font-semibold">{typeLabel}</span>
            {subject ? (
              <>
                <span className="text-tribe-dark-80">·</span>
                <span className="font-medium truncate">{subject}</span>
              </>
            ) : null}
          </p>
          <p className="text-xs text-tribe-dark-80 mt-0.5 line-clamp-1">{item.headline}</p>
          <p className="text-xs text-tribe-dark-60 mt-0.5">{when}</p>
        </div>
      </Link>
    </div>
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
