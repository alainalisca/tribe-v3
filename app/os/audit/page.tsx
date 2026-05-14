'use client';

/**
 * /os/audit — forensic log viewer for a gym.
 *
 * Surfaces the gym_audit_log table (migration 082). Used when a coach
 * or owner needs to answer questions like:
 *   - "Who archived this member last week?"
 *   - "Did someone really purge that client, or did it never exist?"
 *   - "What did the new coach actually touch yesterday?"
 *
 * Access: any coach in the gym (mirrors migration 082's SELECT RLS).
 * Owner-only restriction would defeat the multi-coach trust feature
 * the log is designed for. Owners who want a strict "only I see this"
 * setup are running a single-coach gym anyway — same outcome.
 *
 * The page is intentionally minimal — a table, two dropdown filters
 * (action + target type), one limit selector. No fancy charts. The
 * audience for this surface checks in rarely (monthly at most) so
 * speed-to-answer matters more than rich visualization.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, ScrollText, RefreshCw, Download } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatShortDate } from '@/lib/format/currency';
import { trackEvent } from '@/lib/analytics';
import { markAuditViewed } from '@/components/tribe-os/AuditActivityChip';

interface AuditRow {
  id: string;
  gym_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  actor: { id: string; name: string | null; email: string | null } | null;
}

type LoadState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; entries: AuditRow[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    backLabel: 'Back to gym settings',
    pageTitle: 'Forensic log',
    pageSubtitle: 'Every sensitive action in this gym. Read-only and append-only.',
    loadingLabel: 'Loading',
    redirectingLabel: 'Redirecting',
    errorTitle: 'Could not load the audit log.',
    errorRetry: 'Retry',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    exportCsv: 'Export CSV',
    dateRangeLabel: 'Time range',
    dateRangeAll: 'All time',
    dateRangeWeek: 'Last 7 days',
    dateRangeToday: 'Today',
    filterAllActions: 'All actions',
    filterAllTargets: 'All target types',
    limitLabel: 'Show',
    limitOptions: [
      { value: 25, label: 'Last 25' },
      { value: 50, label: 'Last 50' },
      { value: 100, label: 'Last 100' },
    ],
    columnWhen: 'When',
    columnAction: 'Action',
    columnTarget: 'Target',
    columnActor: 'Actor',
    columnDetails: 'Details',
    emptyTitle: 'No entries yet',
    emptyHint:
      'Audit entries are written when someone archives or purges a client. As soon as that happens here, this list fills up — newest first.',
    actorDeleted: 'Deleted user',
    unknownActor: 'Unknown',
    noPayload: '—',
    rowSummary: (n: number) => (n === 1 ? '1 entry' : `${n} entries`),
  },
  es: {
    backLabel: 'Volver a configuración del gym',
    pageTitle: 'Registro forense',
    pageSubtitle: 'Cada acción sensible en este gym. Solo lectura, solo anexa.',
    loadingLabel: 'Cargando',
    redirectingLabel: 'Redirigiendo',
    errorTitle: 'No se pudo cargar el registro.',
    errorRetry: 'Reintentar',
    refresh: 'Actualizar',
    refreshing: 'Actualizando',
    exportCsv: 'Exportar CSV',
    dateRangeLabel: 'Rango',
    dateRangeAll: 'Todo el tiempo',
    dateRangeWeek: 'Últimos 7 días',
    dateRangeToday: 'Hoy',
    filterAllActions: 'Todas las acciones',
    filterAllTargets: 'Todos los tipos',
    limitLabel: 'Mostrar',
    limitOptions: [
      { value: 25, label: 'Últimos 25' },
      { value: 50, label: 'Últimos 50' },
      { value: 100, label: 'Últimos 100' },
    ],
    columnWhen: 'Cuándo',
    columnAction: 'Acción',
    columnTarget: 'Objetivo',
    columnActor: 'Actor',
    columnDetails: 'Detalles',
    emptyTitle: 'Aún sin registros',
    emptyHint:
      'Las entradas se generan cuando alguien archiva o elimina un cliente. En cuanto eso pase aquí, esta lista se llenará — las más recientes primero.',
    actorDeleted: 'Usuario eliminado',
    unknownActor: 'Desconocido',
    noPayload: '—',
    rowSummary: (n: number) => (n === 1 ? '1 entrada' : `${n} entradas`),
  },
} as const;

/**
 * Friendly labels for known action codes. Anything not in this map
 * renders the raw code (e.g. "client.purge") — fine for forensic
 * use, no point in over-engineering localization for actions the
 * audience already understands as canonical strings.
 */
const ACTION_LABELS: Record<string, { en: string; es: string }> = {
  'client.archive': { en: 'Client archived', es: 'Cliente archivado' },
  'client.purge': { en: 'Client purged', es: 'Cliente eliminado (GDPR)' },
  'attendance.delete': { en: 'Attendance deleted', es: 'Asistencia eliminada' },
  'attendance.refund': { en: 'Attendance refunded', es: 'Asistencia reembolsada' },
  'gym.settings_update': { en: 'Gym settings updated', es: 'Ajustes del gym actualizados' },
  'insight.bulk_dismiss': { en: 'Insights bulk-dismissed', es: 'Insights descartados en lote' },
};

const TARGET_LABELS: Record<string, { en: string; es: string }> = {
  client: { en: 'Client', es: 'Cliente' },
  attendance: { en: 'Attendance', es: 'Asistencia' },
  team: { en: 'Team', es: 'Equipo' },
  gym: { en: 'Gym', es: 'Gym' },
  insight: { en: 'Insight', es: 'Insight' },
};

export default function AuditPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [actionFilter, setActionFilter] = useState<string>('');
  const [targetFilter, setTargetFilter] = useState<string>('');
  // 'all' = no filter, 'today' = midnight UTC today, 'week' = 7 days back.
  // Keeping the buckets fixed avoids a date-picker control while still
  // covering the three time windows that match the typical forensic
  // mental model ("what happened just now / this week / ever").
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week'>('all');
  const [limit, setLimit] = useState<number>(50);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setRefreshing(true);

    (async () => {
      try {
        const params = new URLSearchParams();
        if (actionFilter) params.set('action', actionFilter);
        if (targetFilter) params.set('target_type', targetFilter);
        params.set('limit', String(limit));
        const fromIso = computeFromIso(dateRange);
        if (fromIso) params.set('from', fromIso);
        const res = await fetch(`/api/tribe-os/audit?${params.toString()}`, { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { entries: AuditRow[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.errorTitle });
          setRefreshing(false);
          return;
        }
        setState({ kind: 'ready', entries: body.data.entries });
        setRefreshing(false);
        // Stamp the last-viewed timestamp so the dashboard chip
        // clears. Idempotent and cheap.
        markAuditViewed();
      } catch {
        if (!cancelled) {
          setState({ kind: 'error', message: s.errorTitle });
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // s.errorTitle dep refetches on language flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.state, actionFilter, targetFilter, limit, dateRange, reloadKey, s.errorTitle]);

  // Distinct action + target_type values from the currently-loaded
  // entries, used to populate the filter dropdowns. Sorted A-Z. We
  // don't precompute these server-side — small payload, small filter
  // list, no point in another endpoint.
  const distinctActions = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return Array.from(new Set(state.entries.map((e) => e.action))).sort();
  }, [state]);
  const distinctTargets = useMemo(() => {
    if (state.kind !== 'ready') return [];
    return Array.from(new Set(state.entries.map((e) => e.target_type))).sort();
  }, [state]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-5xl mx-auto space-y-5">
        <Link href="/os/gym" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-3.5 h-3.5" />
          {s.backLabel}
        </Link>

        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-tribe bg-tribe-green-50 flex items-center justify-center shrink-0">
              <ScrollText className="w-5 h-5 text-tribe-green-dark" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
              <p className="text-sm text-tribe-dark-80 mt-1">{s.pageSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* CSV export — preserves the current filter state so
                "filter to client.purge and export" works as one
                action. Anchor (not button) so right-click → Save
                Link As works for power users. */}
            <a
              href={buildExportUrl(actionFilter, targetFilter)}
              onClick={() =>
                trackEvent('tribe_os_audit_exported', {
                  action_filter: actionFilter || null,
                  target_filter: targetFilter || null,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {s.exportCsv}
            </a>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-sm font-semibold text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? s.refreshing : s.refresh}
            </button>
          </div>
        </header>

        {/* Filters bar */}
        <div className="flex items-center gap-2 flex-wrap bg-white border border-gray-200 rounded-xl p-3">
          {/* Date-range quick filter. Three buckets matching the
              forensic mental model — Today, last 7 days, all time.
              A picker would be more flexible but adds chrome the
              80% case doesn't need. */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs">
            {(
              [
                { val: 'today', label: s.dateRangeToday },
                { val: 'week', label: s.dateRangeWeek },
                { val: 'all', label: s.dateRangeAll },
              ] as const
            ).map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setDateRange(opt.val)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                  dateRange === opt.val ? 'bg-white text-tribe-dark shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
          >
            <option value="">{s.filterAllActions}</option>
            {distinctActions.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]?.[language] ?? a}
              </option>
            ))}
          </select>
          <select
            value={targetFilter}
            onChange={(e) => setTargetFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
          >
            <option value="">{s.filterAllTargets}</option>
            {distinctTargets.map((t) => (
              <option key={t} value={t}>
                {TARGET_LABELS[t]?.[language] ?? t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span>{s.limitLabel}</span>
            <select
              value={limit}
              onChange={(e) => setLimit(Number.parseInt(e.target.value, 10))}
              className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
            >
              {s.limitOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {state.kind === 'ready' && state.entries.length > 0 ? (
            <span className="text-xs text-gray-500 ml-auto">{s.rowSummary(state.entries.length)}</span>
          ) : null}
        </div>

        {state.kind === 'loading' ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'error' ? (
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-gray-700">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-white text-gray-900 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
            >
              {s.errorRetry}
            </button>
          </div>
        ) : state.entries.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-2">
            <ScrollText className="w-8 h-8 text-gray-400 mx-auto" />
            <h2 className="text-base font-bold text-gray-900">{s.emptyTitle}</h2>
            <p className="text-sm text-gray-600 max-w-md mx-auto">{s.emptyHint}</p>
          </div>
        ) : (
          <AuditTable entries={state.entries} copy={s} language={language} />
        )}
      </div>
    </div>
  );
}

function AuditTable({
  entries,
  copy: s,
  language,
}: {
  entries: AuditRow[];
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Desktop table */}
      <table className="hidden md:table w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="text-left text-xs font-semibold uppercase tracking-[0.06em] text-gray-500">
            <th className="px-4 py-3">{s.columnWhen}</th>
            <th className="px-4 py-3">{s.columnAction}</th>
            <th className="px-4 py-3">{s.columnTarget}</th>
            <th className="px-4 py-3">{s.columnActor}</th>
            <th className="px-4 py-3">{s.columnDetails}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => (
            <tr key={row.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                {formatRelativeAndExact(row.created_at, language)}
              </td>
              <td className="px-4 py-3 font-semibold text-gray-900">
                {ACTION_LABELS[row.action]?.[language] ?? row.action}
              </td>
              <td className="px-4 py-3 text-gray-700">
                <span className="inline-flex items-center gap-1.5">
                  <span>{TARGET_LABELS[row.target_type]?.[language] ?? row.target_type}</span>
                  {row.target_id ? (
                    <code className="text-[10px] font-mono text-gray-400">{row.target_id.slice(0, 8)}</code>
                  ) : null}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-700">
                {row.actor ? row.actor.name || row.actor.email || s.unknownActor : s.actorDeleted}
              </td>
              <td className="px-4 py-3 text-gray-600 max-w-md">
                {row.payload ? (
                  <code className="text-xs font-mono text-gray-700 block truncate">{formatPayload(row.payload)}</code>
                ) : (
                  <span className="text-gray-400">{s.noPayload}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile stacked list — the table doesn't fit on phones. */}
      <ul className="md:hidden divide-y divide-gray-100">
        {entries.map((row) => (
          <li key={row.id} className="p-4 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-gray-900">{ACTION_LABELS[row.action]?.[language] ?? row.action}</p>
              <p className="text-xs text-gray-500 whitespace-nowrap">
                {formatRelativeAndExact(row.created_at, language)}
              </p>
            </div>
            <p className="text-xs text-gray-600">
              {TARGET_LABELS[row.target_type]?.[language] ?? row.target_type}
              {row.target_id ? (
                <code className="ml-1.5 text-[10px] font-mono text-gray-400">{row.target_id.slice(0, 8)}</code>
              ) : null}
              {' · '}
              {row.actor ? row.actor.name || row.actor.email || s.unknownActor : s.actorDeleted}
            </p>
            {row.payload ? (
              <code className="block text-xs font-mono text-gray-700 break-all">{formatPayload(row.payload)}</code>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Render a created_at ISO into a short display. For forensic use the
 * exact time matters more than relative ("3 minutes ago" is fine for
 * social, useless for "exactly when did this happen?"). We surface
 * the local date + time directly.
 */
function formatRelativeAndExact(iso: string, language: 'en' | 'es'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = formatShortDate(iso, language);
  const timePart = d.toLocaleTimeString(language === 'es' ? 'es-CO' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${datePart} · ${timePart}`;
}

/**
 * Build the audit CSV export URL with the current filter state.
 * The export endpoint accepts the same params as the in-page
 * listing, so "filter to client.purge and export" produces a CSV
 * matching exactly what's on screen.
 */
function buildExportUrl(actionFilter: string, targetFilter: string): string {
  const params = new URLSearchParams();
  if (actionFilter) params.set('action', actionFilter);
  if (targetFilter) params.set('target_type', targetFilter);
  const qs = params.toString();
  return qs ? `/api/tribe-os/audit/export?${qs}` : '/api/tribe-os/audit/export';
}

/**
 * Map the date-range bucket to an ISO `from` bound. Returns null
 * for the 'all' bucket so the URL stays clean.
 *
 * 'today' uses local midnight (browser tz) instead of UTC midnight —
 * matches what the coach reads as "today on the wall clock." A
 * coach in Bogotá at 11pm checking "today" should see the day's
 * events, not yesterday's UTC bucket.
 */
function computeFromIso(range: 'all' | 'today' | 'week'): string | null {
  if (range === 'all') return null;
  if (range === 'week') {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  // 'today' = local midnight
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * Compact one-line render of a payload jsonb. Used in the table cell.
 * Truncates aggressively — clicking through to a detail view isn't
 * in scope yet; the truncated preview answers "what was the name of
 * the client that was purged?" which is the 80% case.
 */
function formatPayload(payload: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(payload);
    return json.length > 120 ? `${json.slice(0, 117)}…` : json;
  } catch {
    return '—';
  }
}
