'use client';

/**
 * /os/members — Tribe.OS members list (rebuilt to match the new
 * mockup).
 *
 * Replaces the old dark-theme `/os/clients` list. The data source is
 * the same (`/api/tribe-os/clients`), but the layout, filter pills,
 * and column set are rebuilt to match the redesign:
 *
 *   - Search box at top right with an "Add Member" CTA
 *   - "All Members" card containing:
 *       Filter pills: All / Active / Watch / At Risk / Churned
 *       Table: Name (+ email), Status, Teams, Tags, Days Since
 *              Login, Sessions (30d), Actions (view + message)
 *
 * Status mapping while the DB enum is still {active, lead, lapsed,
 * inactive}:
 *   UI label   →  DB filter
 *   ----------    ----------
 *   Active     →  status = 'active'
 *   Watch      →  status = 'lapsed' (instructor flagged them but not gone)
 *   At Risk    →  client-side filter: active AND last_seen_at > 14d old
 *   Churned    →  status = 'inactive'
 *
 * The "Teams" column shows '—' until the Teams data model lands;
 * the column is included now so the table layout matches the mockup
 * and slots data in transparently when the migration ships.
 *
 * Existing detail / edit URLs at /os/clients/[id] still work — we
 * link to them directly. A future commit will move them under
 * /os/members/[id] for URL consistency.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Upload, Download, Eye, MessageCircle, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/phone';
import ImportClientsModal from '@/components/tribe-os/ImportClientsModal';
import type { ClientStatus, ClientWithStats } from '@/lib/dal/clients';

type StatusFilter = 'all' | 'active' | 'watch' | 'at_risk' | 'churned' | 'streaking';

type ListState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; rows: ClientWithStats[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    redirectingLabel: 'Redirecting',
    loadingLabel: 'Loading',
    pageTitle: 'All Members',
    searchPlaceholder: 'Search members by name or email…',
    addMember: 'Add Member',
    importCsv: 'Import CSV',
    exportCsv: 'Export CSV',
    tagFilterAllOption: 'All tags',
    tagFilterAria: 'Filter by tag',
    filter: {
      all: 'All',
      active: 'Active',
      watch: 'Watch',
      at_risk: 'At Risk',
      churned: 'Churned',
      streaking: 'On a streak',
    },
    columns: {
      name: 'Name',
      status: 'Status',
      teams: 'Teams',
      tags: 'Tags',
      daysSinceLogin: 'Days Since Login',
      sessions30d: 'Sessions (30d)',
      actions: 'Actions',
    },
    badge: { active: 'Active', watch: 'Watch', atRisk: 'At Risk', churned: 'Churned', lead: 'Lead' },
    actionViewAria: 'View member',
    actionMessageAria: 'Message member',
    daysAgo: (n: number) => (n === 1 ? '1d' : `${n}d`),
    noAttendance: '—',
    noTags: '—',
    noTeams: '—',
    errorTitle: 'Could not load members.',
    retry: 'Retry',
    empty: 'No members yet.',
    emptyHint: 'Add your first member to get started.',
    addFirstMember: 'Add your first member',
    noMatch: 'No members match these filters.',
    noMatchHint: 'Try clearing a filter or searching for a different name.',
    clearFiltersCta: 'Clear filters',
    whatsappCheckIn: (name: string) => `Hey ${name}! Just checking in — how's training going?`,
  },
  es: {
    redirectingLabel: 'Redirigiendo',
    loadingLabel: 'Cargando',
    pageTitle: 'Todos los miembros',
    searchPlaceholder: 'Buscar miembros por nombre o correo…',
    addMember: 'Agregar miembro',
    importCsv: 'Importar CSV',
    exportCsv: 'Exportar CSV',
    tagFilterAllOption: 'Todas las etiquetas',
    tagFilterAria: 'Filtrar por etiqueta',
    filter: {
      all: 'Todos',
      active: 'Activos',
      watch: 'En seguimiento',
      at_risk: 'En riesgo',
      churned: 'Bajas',
      streaking: 'En racha',
    },
    columns: {
      name: 'Nombre',
      status: 'Estado',
      teams: 'Equipos',
      tags: 'Etiquetas',
      daysSinceLogin: 'Días sin actividad',
      sessions30d: 'Sesiones (30d)',
      actions: 'Acciones',
    },
    badge: {
      active: 'Activo',
      watch: 'En seguimiento',
      atRisk: 'En riesgo',
      churned: 'Baja',
      lead: 'Prospecto',
    },
    actionViewAria: 'Ver miembro',
    actionMessageAria: 'Enviar mensaje',
    daysAgo: (n: number) => (n === 1 ? '1d' : `${n}d`),
    noAttendance: '—',
    noTags: '—',
    noTeams: '—',
    errorTitle: 'No se pudieron cargar los miembros.',
    retry: 'Reintentar',
    empty: 'Aún sin miembros.',
    emptyHint: 'Agrega tu primer miembro para empezar.',
    addFirstMember: 'Agregar el primer miembro',
    noMatch: 'Ningún miembro coincide con estos filtros.',
    noMatchHint: 'Intenta limpiar un filtro o buscar otro nombre.',
    clearFiltersCta: 'Limpiar filtros',
    whatsappCheckIn: (name: string) => `¡Hola ${name}! Pasaba a saludarte. ¿Cómo va el entrenamiento?`,
  },
} as const;

export default function MembersPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Tag scope — null = all tags. Applied client-side after the
  // status / search filters from the server response, so it
  // composes cleanly with the AI-derived "At Risk" / "Watch" pills.
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [showImport, setShowImport] = useState(false);

  // Debounce search.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setList({ kind: 'loading' });

    (async () => {
      try {
        const url = new URL('/api/tribe-os/clients/', window.location.origin);
        if (debouncedSearch.length > 0) url.searchParams.set('search', debouncedSearch);

        // Map UI filter → DB status filter. 'at_risk' is computed
        // client-side from the full active set; for the other pills
        // we push the filter into the query.
        const dbStatus = uiStatusToDbStatus(statusFilter);
        if (dbStatus) url.searchParams.set('status', dbStatus);

        const res = await fetch(url.toString(), { method: 'GET' });
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: ClientWithStats[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setList({ kind: 'error', message: body.error || s.errorTitle });
          return;
        }

        let rows = body.data ?? [];
        // Client-side filter for "At Risk".
        // Two paths to qualify:
        //   1. AI scored health_status = 'AT_RISK' (primary path
        //      once the intelligence engine has run)
        //   2. Heuristic fallback: status = 'active' AND last_seen
        //      older than 14 days (or never seen and created > 14d ago)
        // The 'Watch' filter still uses status = 'lapsed' via the
        // server-side filter — when health_status = 'WATCH' becomes
        // common we'll add the same OR there.
        if (statusFilter === 'at_risk') {
          const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
          rows = rows.filter((r) => {
            if (r.health_status === 'AT_RISK') return true;
            if (r.status !== 'active') return false;
            const seen = r.last_attendance_at ? new Date(r.last_attendance_at).getTime() : null;
            const created = new Date(r.created_at).getTime();
            return seen != null ? seen < cutoff : created < cutoff;
          });
        } else if (statusFilter === 'watch') {
          // Augment the server's `status = 'lapsed'` filter with the
          // AI's WATCH label. Both surfaces represent the same
          // semantic ("declining but not gone").
          rows = rows.filter((r) => r.status === 'lapsed' || r.health_status === 'WATCH');
        } else if (statusFilter === 'streaking') {
          // "Streaking" mirrors the dashboard Celebrate-Wins widget's
          // threshold (7+ day active streak). Lets a coach pull up
          // the whole list of members worth a quick congrats — useful
          // for batch outreach when the widget's 10-row cap isn't
          // enough.
          rows = rows.filter((r) => (r.current_streak_days ?? 0) >= 7);
        }

        // Tag filter (client-side) — applied after the AI-aware
        // status filters so a coach can ask "show me at-risk VIP
        // members" with one combined view.
        if (tagFilter) {
          rows = rows.filter((r) => r.tags.includes(tagFilter));
        }

        setList({ kind: 'ready', rows });
        trackEvent('tribe_os_members_viewed', { row_count: rows.length, filter: statusFilter });
      } catch {
        if (!cancelled) setList({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, debouncedSearch, statusFilter, tagFilter, reloadKey, s.errorTitle]);

  // Build the list of tag options for the dropdown from the
  // currently-loaded rows. Composing this on a separate fetch (full
  // tag universe per gym) would be more accurate when the status
  // filter hides VIPs etc., but at the scale we ship to this is good
  // enough — coaches typically scan within the filtered cohort.
  const tagOptions = useMemo(() => {
    if (list.kind !== 'ready') return [] as string[];
    return Array.from(new Set(list.rows.flatMap((r) => r.tags))).sort();
  }, [list]);

  const isFiltered = useMemo(
    () => debouncedSearch.length > 0 || statusFilter !== 'all' || tagFilter !== null,
    [debouncedSearch, statusFilter, tagFilter]
  );

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-500 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Search bar + Add Member button (full-width row at top) */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={s.searchPlaceholder}
              className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
            />
          </div>
          {/* Export CSV — downloads every non-archived client in a
              format that round-trips with the importer. Uses a button
              + programmatic navigation rather than a plain <a> so the
              Next no-html-link-for-pages rule stays happy (the rule
              is meant for in-app page navigation; an API download is
              a legitimate exception but the button is cleaner than
              an eslint-disable). */}
          <button
            type="button"
            onClick={() => {
              trackEvent('tribe_os_clients_exported');
              window.location.href = '/api/tribe-os/clients/export';
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-tribe-dark text-sm font-semibold rounded-xl border border-gray-200 hover:border-tribe-green hover:bg-tribe-green/5 transition-colors"
          >
            <Download className="w-4 h-4" />
            {s.exportCsv}
          </button>
          {/* Import CSV — secondary action next to "Add Member" so
              coaches with an existing roster don't have to retype it
              client by client. Visible to every coach; RLS gates
              writes at the DB layer. */}
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-tribe-dark text-sm font-semibold rounded-xl border border-gray-200 hover:border-tribe-green hover:bg-tribe-green/5 transition-colors"
          >
            <Upload className="w-4 h-4" />
            {s.importCsv}
          </button>
          <Link
            href="/os/clients/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-tribe-green text-tribe-dark text-sm font-bold rounded-xl hover:shadow-[0_4px_20px_rgba(132,204,22,0.25)] hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {s.addMember}
          </Link>
        </div>

        {/* Members card */}
        <section className="bg-white rounded-xl border border-gray-200">
          <header className="px-5 py-4">
            <h2 className="text-base font-bold text-gray-900">{s.pageTitle}</h2>
          </header>

          {/* Filter pills + tag select */}
          <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
            {(['all', 'active', 'streaking', 'watch', 'at_risk', 'churned'] as const).map((f) => (
              <FilterPill key={f} active={statusFilter === f} label={s.filter[f]} onClick={() => setStatusFilter(f)} />
            ))}
            {/* Tag scope — only renders when the loaded set has at
                least one tag to choose from. Empty value means "all
                tags"; client-side filter composes with the status
                pill so coaches can ask "show me at-risk VIPs". */}
            {tagOptions.length > 0 ? (
              <select
                value={tagFilter ?? ''}
                onChange={(e) => setTagFilter(e.target.value || null)}
                aria-label={s.tagFilterAria}
                className="text-xs font-semibold px-2.5 py-1.5 bg-white border border-gray-200 rounded-full text-gray-700 focus:outline-none focus:border-tribe-green"
              >
                <option value="">{s.tagFilterAllOption}</option>
                {tagOptions.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {/* Body */}
          {list.kind === 'loading' ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : list.kind === 'error' ? (
            <div className="py-12 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
              <p className="text-sm text-gray-700">{list.message}</p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="px-4 py-2 bg-gray-100 text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-200"
              >
                {s.retry}
              </button>
            </div>
          ) : list.rows.length === 0 && !isFiltered ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-semibold text-gray-900">{s.empty}</p>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">{s.emptyHint}</p>
              <Link
                href="/os/clients/new"
                className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full"
              >
                <Plus className="w-3.5 h-3.5" />
                {s.addFirstMember}
              </Link>
            </div>
          ) : list.rows.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <p className="text-sm font-semibold text-gray-900">{s.noMatch}</p>
              <p className="text-xs text-gray-500">{s.noMatchHint}</p>
              {/* Clear-filters CTA — surfaces only when any filter is
                  actually active. Reset all three (search + status +
                  tag) in one tap so the coach doesn't have to
                  hunt for which filter is the culprit. */}
              {search.trim() || statusFilter !== 'all' || tagFilter ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setStatusFilter('all');
                    setTagFilter(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-tribe-green text-tribe-dark text-xs font-semibold rounded-full hover:bg-tribe-green-dark hover:text-white transition-colors"
                >
                  {s.clearFiltersCta}
                </button>
              ) : null}
            </div>
          ) : (
            <MembersTable rows={list.rows} copy={s} />
          )}
        </section>
      </div>

      {showImport ? (
        <ImportClientsModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            // Refresh the list so newly-imported clients appear
            // immediately. Modal stays open so the user can read
            // the result; closing it later is their choice.
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Map a UI filter pill to a server-side status filter.
 *
 * For pills whose semantics are AI-derived (Watch, At Risk) we
 * intentionally return null so the server returns the FULL roster —
 * the post-filter step on the client looks at both `status` and
 * `health_status`. If we pushed `status='active'` to the server
 * we'd miss any lapsed members the AI flagged as AT_RISK, and
 * vice-versa.
 *
 * Active / Churned are still mapped 1:1 to a DB status because
 * those are manual-only labels.
 */
function uiStatusToDbStatus(ui: StatusFilter): ClientStatus | null {
  switch (ui) {
    case 'active':
      return 'active';
    case 'churned':
      return 'inactive';
    case 'at_risk':
    case 'watch':
    case 'streaking':
      // No server-side status filter — the client-side filter combines
      // health_status (AI) + status (manual) into a single bucket. Same
      // pattern for 'streaking', which is a current_streak_days >= 7
      // filter applied after the basic list comes back.
      return null;
    case 'all':
    default:
      return null;
  }
}

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center px-3 py-1.5 text-xs font-bold rounded-full transition-colors ${
        active ? 'bg-tribe-green text-tribe-dark' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );
}

function MembersTable({ rows, copy: s }: { rows: ClientWithStats[]; copy: typeof copy.en | typeof copy.es }) {
  return (
    <div className="overflow-x-auto border-t border-gray-100">
      {/* Header — visible on lg+ */}
      <div className="hidden lg:grid grid-cols-[2fr_1fr_1.2fr_1.4fr_1fr_1fr_0.8fr] gap-3 px-5 py-3 text-[10px] uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-100">
        <span>{s.columns.name}</span>
        <span>{s.columns.status}</span>
        <span>{s.columns.teams}</span>
        <span>{s.columns.tags}</span>
        <span>{s.columns.daysSinceLogin}</span>
        <span>{s.columns.sessions30d}</span>
        <span className="text-right">{s.columns.actions}</span>
      </div>

      <ul className="divide-y divide-gray-100">
        {rows.map((r) => (
          <MemberRow key={r.id} row={r} copy={s} />
        ))}
      </ul>
    </div>
  );
}

function MemberRow({ row, copy: s }: { row: ClientWithStats; copy: typeof copy.en | typeof copy.es }) {
  const initial = (row.name.charAt(0) || '?').toUpperCase();
  // Badge precedence:
  //   1. AI-derived health_status when the scorer has run
  //      (WATCH / AT_RISK take priority over the manual status)
  //   2. Manual status overrides (lapsed → Watch, inactive → Churned,
  //      lead → Lead) for rows the AI hasn't scored yet
  //   3. Heuristic fallback (active + no attendance > 14d → AT_RISK)
  //      for rows that have neither AI score nor a manual override
  //   4. Default → Active
  const seenMs = row.last_attendance_at ? new Date(row.last_attendance_at).getTime() : null;
  const ageDays = seenMs ? Math.floor((Date.now() - seenMs) / (24 * 60 * 60 * 1000)) : null;
  const heuristicAtRisk = row.status === 'active' && (ageDays == null || ageDays > 14);

  let displayStatus: 'active' | 'watch' | 'atRisk' | 'churned' | 'lead';
  if (row.health_status === 'AT_RISK') {
    displayStatus = 'atRisk';
  } else if (row.health_status === 'WATCH') {
    displayStatus = 'watch';
  } else if (row.status === 'lapsed') {
    displayStatus = 'watch';
  } else if (row.status === 'inactive') {
    displayStatus = 'churned';
  } else if (row.status === 'lead') {
    displayStatus = 'lead';
  } else if (heuristicAtRisk) {
    displayStatus = 'atRisk';
  } else {
    displayStatus = 'active';
  }

  const firstName = row.name.split(' ')[0] || row.name;
  const waUrl = buildWhatsAppUrl(row.phone, {
    message: s.whatsappCheckIn(firstName),
  });

  return (
    <li className="lg:grid lg:grid-cols-[2fr_1fr_1.2fr_1.4fr_1fr_1fr_0.8fr] lg:gap-3 lg:items-center px-5 py-3 hover:bg-gray-50 transition-colors">
      {/* Name + email */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-tribe-green/20 text-tribe-dark font-bold flex items-center justify-center text-xs shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <Link href={`/os/clients/${row.id}`} className="block">
            <p className="text-sm font-semibold text-gray-900 truncate hover:text-tribe-dark">{row.name}</p>
            {row.email ? <p className="text-xs text-gray-500 truncate">{row.email}</p> : null}
          </Link>
        </div>
      </div>

      {/* Status — uses computed display value */}
      <div className="mt-2 lg:mt-0">
        <StatusBadge kind={displayStatus} copy={s} />
      </div>

      {/* Teams — placeholder until Teams data model ships */}
      <div className="mt-1 lg:mt-0">
        <span className="text-xs text-gray-400">{s.noTeams}</span>
      </div>

      {/* Tags */}
      <div className="mt-1 lg:mt-0 flex flex-wrap gap-1">
        {row.tags.length === 0 ? (
          <span className="text-xs text-gray-400">{s.noTags}</span>
        ) : (
          row.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-200"
            >
              {t}
            </span>
          ))
        )}
      </div>

      {/* Days since login (= since last attendance) */}
      <div className="mt-1 lg:mt-0">
        <DaysSince days={ageDays} copy={s} />
      </div>

      {/* Sessions 30d — placeholder using total_attended_count until
          a 30-day rolling window is computed server-side. */}
      <div className="mt-1 lg:mt-0">
        <span className="text-xs font-semibold text-gray-700 tabular-nums">{row.total_attended_count}</span>
      </div>

      {/* Actions */}
      <div className="mt-2 lg:mt-0 flex items-center gap-1 justify-start lg:justify-end">
        <Link
          href={`/os/clients/${row.id}`}
          aria-label={s.actionViewAria}
          className="inline-flex items-center justify-center w-8 h-8 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Eye className="w-4 h-4" />
        </Link>
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={s.actionMessageAria}
            onClick={() => trackEvent('tribe_os_whatsapp_clicked', { surface: 'members_table' })}
            className="inline-flex items-center justify-center w-8 h-8 text-gray-500 hover:text-tribe-dark hover:bg-tribe-green/15 rounded-lg transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

function StatusBadge({
  kind,
  copy: s,
}: {
  kind: 'active' | 'watch' | 'atRisk' | 'churned' | 'lead';
  copy: typeof copy.en | typeof copy.es;
}) {
  const styles = {
    active: 'bg-tribe-green/20 text-tribe-dark border-tribe-green/30',
    watch: 'bg-amber-100 text-amber-800 border-amber-200',
    atRisk: 'bg-red-100 text-red-700 border-red-200',
    churned: 'bg-gray-100 text-gray-600 border-gray-200',
    lead: 'bg-blue-50 text-blue-700 border-blue-200',
  } as const;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${styles[kind]}`}
    >
      {s.badge[kind]}
    </span>
  );
}

function DaysSince({ days, copy: s }: { days: number | null; copy: typeof copy.en | typeof copy.es }) {
  if (days == null) return <span className="text-xs text-gray-400 font-medium">{s.noAttendance}</span>;
  const isAlert = days >= 14;
  const isWarn = days >= 7 && days < 14;
  const cls = isAlert ? 'text-tribe-red' : isWarn ? 'text-amber-700' : 'text-tribe-green';
  return <span className={`text-xs font-bold tabular-nums ${cls}`}>{s.daysAgo(days)}</span>;
}
