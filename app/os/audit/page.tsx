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

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertCircle, ScrollText, RefreshCw, Download, ChevronRight, Info } from 'lucide-react';
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
    onlyMine: 'Only mine',
    onlyMineHint: 'Filter to entries you wrote yourself',
    actorLabel: 'Actor',
    actorAll: 'Everyone',
    actorMe: 'Only me',
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
    toggleDetails: 'Toggle details',
    detailEventTime: 'Event time (UTC)',
    detailTargetId: 'Target ID',
    detailActorEmail: 'Actor email',
    detailPayload: 'Payload',
    jumpToClient: 'Open client →',
    jumpToTeam: 'Open team →',
    jumpToCoaches: 'Manage coaches →',
    emptyTitle: 'No entries yet',
    emptyHint:
      'Audit entries are written when someone archives or purges a client. As soon as that happens here, this list fills up — newest first.',
    emptyFilteredTitle: 'No entries match these filters',
    emptyFilteredHint:
      "Try widening the time range or clearing one of the filters. There's likely more activity outside the current selection.",
    clearFiltersCta: 'Clear filters',
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
    onlyMine: 'Solo mías',
    onlyMineHint: 'Filtrar a las entradas que escribiste',
    actorLabel: 'Actor',
    actorAll: 'Todos',
    actorMe: 'Solo yo',
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
    toggleDetails: 'Ver detalles',
    detailEventTime: 'Hora del evento (UTC)',
    detailTargetId: 'ID del objetivo',
    detailActorEmail: 'Correo del actor',
    detailPayload: 'Datos',
    jumpToClient: 'Abrir cliente →',
    jumpToTeam: 'Abrir equipo →',
    jumpToCoaches: 'Administrar entrenadores →',
    emptyTitle: 'Aún sin registros',
    emptyHint:
      'Las entradas se generan cuando alguien archiva o elimina un cliente. En cuanto eso pase aquí, esta lista se llenará — las más recientes primero.',
    emptyFilteredTitle: 'No hay entradas con estos filtros',
    emptyFilteredHint:
      'Prueba ampliar el rango de fechas o quitar uno de los filtros. Seguramente hay más actividad fuera de la selección actual.',
    clearFiltersCta: 'Limpiar filtros',
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
  'coach.invite': { en: 'Coach invited', es: 'Entrenador invitado' },
  'coach.remove': { en: 'Coach removed', es: 'Entrenador removido' },
  'team.create': { en: 'Team created', es: 'Equipo creado' },
  'team.update': { en: 'Team updated', es: 'Equipo actualizado' },
  'team.delete': { en: 'Team deleted', es: 'Equipo eliminado' },
  'team.member_add': { en: 'Member added to team', es: 'Miembro agregado al equipo' },
  'team.member_remove': { en: 'Member removed from team', es: 'Miembro removido del equipo' },
  'clients.bulk_import': { en: 'Clients bulk-imported', es: 'Clientes importados en lote' },
};

const TARGET_LABELS: Record<string, { en: string; es: string }> = {
  client: { en: 'Client', es: 'Cliente' },
  attendance: { en: 'Attendance', es: 'Asistencia' },
  team: { en: 'Team', es: 'Equipo' },
  gym: { en: 'Gym', es: 'Gym' },
  insight: { en: 'Insight', es: 'Insight' },
  coach: { en: 'Coach', es: 'Entrenador' },
};

/**
 * Plain-language descriptions of each action code, rendered as a
 * native tooltip (`title=`) on the action label. Owners and external
 * auditors don't always know what e.g. "Insights bulk-dismissed"
 * means in practice — the tooltip closes that gap without bloating
 * the table layout.
 *
 * Bilingual; falls back to the action code when no description is
 * defined (same fallback model as ACTION_LABELS).
 */
const ACTION_DESCRIPTIONS: Record<string, { en: string; es: string }> = {
  'client.archive': {
    en: 'Client was hidden from the active roster. Their data is retained for re-activation later.',
    es: 'El cliente fue ocultado del listado activo. Sus datos se conservan para reactivación más adelante.',
  },
  'client.purge': {
    en: 'Client and all associated data were permanently deleted, typically for a GDPR request.',
    es: 'El cliente y todos sus datos fueron eliminados permanentemente, normalmente por una solicitud GDPR.',
  },
  'attendance.delete': {
    en: "An attendance record was removed. The check-in no longer counts toward the member's streak or class history.",
    es: 'Se eliminó un registro de asistencia. El check-in deja de contar en la racha o el historial del miembro.',
  },
  'attendance.refund': {
    en: "An attendance record was kept but marked as refunded — the member's session credit was returned.",
    es: 'Se conservó el registro pero se marcó como reembolsado — el crédito de la sesión volvió al miembro.',
  },
  'gym.settings_update': {
    en: 'A gym-wide setting changed (name, branding, integrations, payout details, etc.).',
    es: 'Se cambió un ajuste del gym (nombre, marca, integraciones, datos de pago, etc.).',
  },
  'insight.bulk_dismiss': {
    en: 'Multiple coaching insights were dismissed in one action. The underlying signals still exist; they just were hidden from the dashboard.',
    es: 'Se descartaron varios insights de coaching en una sola acción. Las señales subyacentes existen; solo se ocultaron del panel.',
  },
  'coach.invite': {
    en: 'A coach or assistant was added to this gym. When this entry shows a prior_role in the payload, it was a role change rather than a brand new invite.',
    es: 'Se agregó un entrenador o asistente al gym. Si el registro muestra prior_role en el payload, fue un cambio de rol y no una invitación nueva.',
  },
  'coach.remove': {
    en: 'A coach was removed from this gym. They no longer have access to gym data or the ability to record attendance. The owner can re-invite them at any time.',
    es: 'Se removió un entrenador del gym. Ya no tiene acceso a los datos ni puede registrar asistencia. El propietario puede volver a invitarlo cuando quiera.',
  },
  'team.create': {
    en: 'A new team was created. Teams group members together for the dashboard filter and member-list pills; they do not affect access controls.',
    es: 'Se creó un nuevo equipo. Los equipos agrupan miembros para el filtro del panel y las pestañas de la lista; no afectan permisos.',
  },
  'team.update': {
    en: 'A team’s name, color, or assigned coach was changed. Existing members remain in the team.',
    es: 'Cambió el nombre, color o entrenador asignado al equipo. Los miembros existentes permanecen en el equipo.',
  },
  'team.delete': {
    en: 'A team was deleted. Its members keep all their data — only the team grouping is removed. The payload records how many members were in the team at delete time.',
    es: 'Se eliminó un equipo. Sus miembros conservan toda su información — solo se elimina la agrupación. El registro guarda cuántos miembros tenía al borrar.',
  },
  'team.member_add': {
    en: 'A client was added to a team. The audit row captures both the team name and the client name so a forensic reader doesn’t have to resolve UUIDs.',
    es: 'Se agregó un cliente al equipo. El registro guarda tanto el nombre del equipo como del cliente para no tener que resolver UUIDs.',
  },
  'team.member_remove': {
    en: 'A client was removed from a team. The client’s data is untouched — only their team membership is. The audit row carries the team and client names at the time of removal.',
    es: 'Se quitó un cliente del equipo. Los datos del cliente no se tocan — solo su membresía al equipo. El registro guarda los nombres del equipo y del cliente al momento de la acción.',
  },
  'clients.bulk_import': {
    en: 'Clients were added via the CSV importer. The payload records how many rows were created, how many were skipped due to validation errors, and the total submitted. No per-row audit — that would drown the log; this aggregate row is the trail.',
    es: 'Se agregaron clientes con el importador CSV. El registro guarda cuántas filas se crearon, cuántas se omitieron por errores y cuántas se enviaron en total. No hay registro por fila — eso saturaría el log; este registro agregado es la huella.',
  },
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
  // When true, scope to entries the current user wrote. Useful in a
  // multi-coach gym for "what did I do today?" review.
  const [onlyMine, setOnlyMine] = useState(false);
  // Per-coach actor filter. Empty string = no filter beyond what
  // onlyMine specifies. Set to a coach's user_id to narrow to "what
  // did Veronica do?" — the multi-coach forensic case. Mutually
  // exclusive with onlyMine in the UI: enabling one resets the other.
  const [actorFilter, setActorFilter] = useState<string>('');
  const [coaches, setCoaches] = useState<Array<{ user_id: string; name: string }> | null>(null);
  const [limit, setLimit] = useState<number>(50);
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Lazy-fetch the coach roster ONCE on first allowed render. We
  // only need name + user_id to populate the dropdown options; the
  // gym-coaches endpoint already gates on the same premium check.
  // Failing this fetch silently is fine — the dropdown will just
  // not show specific coaches, falling back to the all/me toggle.
  useEffect(() => {
    if (gate.state !== 'allowed' || coaches !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/coaches/', { method: 'GET' });
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { coaches?: Array<{ user_id: string; user?: { name?: string | null } | null }> };
        };
        if (!body.success || !body.data) {
          setCoaches([]);
          return;
        }
        const list = (body.data.coaches ?? [])
          .map((c) => ({ user_id: c.user_id, name: c.user?.name?.trim() || 'Unknown' }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCoaches(list);
      } catch {
        if (!cancelled) setCoaches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [gate.state, coaches]);

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
        // Actor scoping: explicit coach pick takes precedence over
        // the "only mine" checkbox. They're UI-exclusive but we
        // still guard the precedence here for safety.
        if (actorFilter) {
          params.set('actor_user_id', actorFilter);
        } else if (onlyMine && gate.userId) {
          params.set('actor_user_id', gate.userId);
        }
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
  }, [
    gate.state,
    gate.userId,
    actionFilter,
    targetFilter,
    limit,
    dateRange,
    onlyMine,
    actorFilter,
    reloadKey,
    s.errorTitle,
  ]);

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
              href={buildExportUrl(
                actionFilter,
                targetFilter,
                dateRange,
                actorFilter || (onlyMine ? gate.userId : null)
              )}
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
          {/* "Only mine" toggle. Useful in multi-coach gyms for
              answering 'what did I do today?' without scrolling
              through everyone else's actions. Mutually exclusive
              with the per-coach actor dropdown — enabling one
              resets the other so the URL only ever carries one
              actor_user_id value. */}
          <label
            className="inline-flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none"
            title={s.onlyMineHint}
          >
            <input
              type="checkbox"
              checked={onlyMine}
              onChange={(e) => {
                setOnlyMine(e.target.checked);
                if (e.target.checked) setActorFilter('');
              }}
              className="h-4 w-4 rounded border-gray-300 text-tribe-green focus:ring-tribe-green"
            />
            <span className="font-semibold text-gray-700">{s.onlyMine}</span>
          </label>
          {/* Per-coach actor dropdown. Only renders when there's
              more than one coach in the gym — a single-coach gym
              would offer the user a dropdown with just themselves
              in it, which is identical to "Only mine" and feels
              broken. Filtering out the current user from the list
              would have been a nicer pattern but the audit-viewer
              often wants to scope to themselves WITH another filter
              applied, so we leave the user in the list. */}
          {coaches && coaches.length > 1 ? (
            <label className="inline-flex items-center gap-2 text-xs text-gray-600">
              <span className="font-semibold text-gray-700">{s.actorLabel}</span>
              <select
                value={actorFilter}
                onChange={(e) => {
                  setActorFilter(e.target.value);
                  if (e.target.value) setOnlyMine(false);
                }}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
              >
                <option value="">{s.actorAll}</option>
                {coaches.map((c) => (
                  <option key={c.user_id} value={c.user_id}>
                    {c.user_id === gate.userId ? s.actorMe : c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
          (() => {
            // Differentiate "no events ever" from "no events matching
            // these filters." The latter case is recoverable — show
            // a clear-filters CTA so the user doesn't conclude the
            // log is broken.
            const hasFilters = !!(actionFilter || targetFilter || dateRange !== 'all' || onlyMine || actorFilter);
            return (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-3">
                <ScrollText className="w-8 h-8 text-theme-tertiary mx-auto" />
                <h2 className="text-base font-bold text-gray-900">
                  {hasFilters ? s.emptyFilteredTitle : s.emptyTitle}
                </h2>
                <p className="text-sm text-gray-600 max-w-md mx-auto">
                  {hasFilters ? s.emptyFilteredHint : s.emptyHint}
                </p>
                {hasFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      setActionFilter('');
                      setTargetFilter('');
                      setDateRange('all');
                      setOnlyMine(false);
                      setActorFilter('');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 mt-2 bg-tribe-green text-tribe-dark text-sm font-semibold rounded-lg hover:bg-tribe-green-dark hover:text-white transition-colors"
                  >
                    {s.clearFiltersCta}
                  </button>
                ) : null}
              </div>
            );
          })()
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
  // Track which rows are expanded so the user can read the full
  // payload. Click anywhere on the row to toggle. Multiple rows
  // can be expanded at once — forensic work often involves
  // comparing two events side by side.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Desktop table */}
      <table className="hidden md:table w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="text-left text-xs font-semibold uppercase tracking-[0.06em] text-gray-500">
            <th className="px-4 py-3 w-6" aria-label={s.toggleDetails}></th>
            <th className="px-4 py-3">{s.columnWhen}</th>
            <th className="px-4 py-3">{s.columnAction}</th>
            <th className="px-4 py-3">{s.columnTarget}</th>
            <th className="px-4 py-3">{s.columnActor}</th>
            <th className="px-4 py-3">{s.columnDetails}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => {
            const isOpen = expanded.has(row.id);
            return (
              <Fragment key={row.id}>
                <tr
                  className={`border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer ${
                    isOpen ? 'bg-gray-50' : ''
                  }`}
                  onClick={() => toggle(row.id)}
                  aria-expanded={isOpen}
                >
                  <td className="px-4 py-3 text-theme-tertiary">
                    <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                    {formatRelativeAndExact(row.created_at, language)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    <span
                      className="inline-flex items-center gap-1"
                      // Native title gives us a free, accessible
                      // tooltip everywhere — desktop hover, screen
                      // readers, and even mobile long-press. Anything
                      // richer is wasted polish here.
                      title={ACTION_DESCRIPTIONS[row.action]?.[language]}
                    >
                      {ACTION_LABELS[row.action]?.[language] ?? row.action}
                      {ACTION_DESCRIPTIONS[row.action] ? (
                        <Info className="w-3 h-3 text-theme-tertiary flex-shrink-0" aria-hidden="true" />
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{TARGET_LABELS[row.target_type]?.[language] ?? row.target_type}</span>
                      {row.target_id ? (
                        <code className="text-[10px] font-mono text-theme-tertiary">{row.target_id.slice(0, 8)}</code>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {row.actor ? row.actor.name || row.actor.email || s.unknownActor : s.actorDeleted}
                  </td>
                  <td className="px-4 py-3 text-gray-600 max-w-md">
                    {row.payload ? (
                      <code className="text-xs font-mono text-gray-700 block truncate">
                        {formatPayload(row.payload)}
                      </code>
                    ) : (
                      <span className="text-theme-tertiary">{s.noPayload}</span>
                    )}
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <td colSpan={6} className="px-4 py-3">
                      <ExpandedDetail row={row} copy={s} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Mobile stacked list — the table doesn't fit on phones. */}
      <ul className="md:hidden divide-y divide-gray-100">
        {entries.map((row) => {
          const isOpen = expanded.has(row.id);
          return (
            <li key={row.id} className={`p-4 space-y-1 ${isOpen ? 'bg-gray-50' : ''}`}>
              <button type="button" onClick={() => toggle(row.id)} aria-expanded={isOpen} className="w-full text-left">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="text-sm font-bold text-gray-900 inline-flex items-center gap-1.5"
                    // Same native-title tooltip pattern as the desktop
                    // table. On phones it surfaces via tap-and-hold.
                    title={ACTION_DESCRIPTIONS[row.action]?.[language]}
                  >
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-theme-tertiary transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    />
                    {ACTION_LABELS[row.action]?.[language] ?? row.action}
                    {ACTION_DESCRIPTIONS[row.action] ? (
                      <Info className="w-3 h-3 text-theme-tertiary flex-shrink-0" aria-hidden="true" />
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-500 whitespace-nowrap">
                    {formatRelativeAndExact(row.created_at, language)}
                  </p>
                </div>
                <p className="text-xs text-gray-600 pl-5">
                  {TARGET_LABELS[row.target_type]?.[language] ?? row.target_type}
                  {row.target_id ? (
                    <code className="ml-1.5 text-[10px] font-mono text-theme-tertiary">
                      {row.target_id.slice(0, 8)}
                    </code>
                  ) : null}
                  {' · '}
                  {row.actor ? row.actor.name || row.actor.email || s.unknownActor : s.actorDeleted}
                </p>
                {row.payload && !isOpen ? (
                  <code className="block pl-5 text-xs font-mono text-gray-700 break-all">
                    {formatPayload(row.payload)}
                  </code>
                ) : null}
              </button>
              {isOpen ? (
                <div className="pl-5 pt-2">
                  <ExpandedDetail row={row} copy={s} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Expanded detail panel for one audit row. Shows the full payload
 * as pretty-printed JSON plus the rarely-needed metadata (full
 * target_id, exact ISO timestamp) that the summary line truncates.
 */
function ExpandedDetail({ row, copy: s }: { row: AuditRow; copy: typeof copy.en | typeof copy.es }) {
  // Build a "jump to target" deep-link when the audit row references
  // something we have a page for. Defensive: we don't try to verify
  // the target still exists (a purged client would 404 the link) —
  // the audit log is the source of truth even when the entity is
  // gone, and a forensic reader expects to see the dead link.
  let jumpHref: string | null = null;
  let jumpLabel: string | null = null;
  if (row.target_id && row.target_type === 'client') {
    jumpHref = `/os/clients/${row.target_id}`;
    jumpLabel = s.jumpToClient;
  } else if (row.target_id && row.target_type === 'team') {
    jumpHref = `/os/teams/${row.target_id}`;
    jumpLabel = s.jumpToTeam;
  } else if (row.target_type === 'coach') {
    // No per-coach detail page exists yet; deep-link to the roster
    // instead so the reader can verify the row is gone.
    jumpHref = '/os/coaches';
    jumpLabel = s.jumpToCoaches;
  }

  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <div>
          <dt className="text-gray-500 font-semibold">{s.detailEventTime}</dt>
          <dd className="text-gray-900 font-mono">{row.created_at}</dd>
        </div>
        {row.target_id ? (
          <div>
            <dt className="text-gray-500 font-semibold">{s.detailTargetId}</dt>
            <dd className="text-gray-900 font-mono break-all">{row.target_id}</dd>
          </div>
        ) : null}
        {row.actor?.email ? (
          <div>
            <dt className="text-gray-500 font-semibold">{s.detailActorEmail}</dt>
            <dd className="text-gray-900 font-mono break-all">{row.actor.email}</dd>
          </div>
        ) : null}
      </dl>
      {jumpHref && jumpLabel ? (
        <Link
          href={jumpHref}
          className="inline-flex items-center text-xs font-semibold text-tribe-green-dark hover:underline"
        >
          {jumpLabel}
        </Link>
      ) : null}
      <div>
        <p className="text-xs text-gray-500 font-semibold mb-1">{s.detailPayload}</p>
        {row.payload ? (
          <pre className="text-xs font-mono text-gray-800 bg-white border border-gray-200 rounded-lg p-3 overflow-auto whitespace-pre-wrap break-all max-h-72">
            {JSON.stringify(row.payload, null, 2)}
          </pre>
        ) : (
          <p className="text-xs text-theme-tertiary italic">{s.noPayload}</p>
        )}
      </div>
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
function buildExportUrl(
  actionFilter: string,
  targetFilter: string,
  dateRange: 'all' | 'today' | 'week',
  actorUserId: string | null
): string {
  const params = new URLSearchParams();
  if (actionFilter) params.set('action', actionFilter);
  if (targetFilter) params.set('target_type', targetFilter);
  const fromIso = computeFromIso(dateRange);
  if (fromIso) params.set('from', fromIso);
  if (actorUserId) params.set('actor_user_id', actorUserId);
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
