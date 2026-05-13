'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, AlertCircle, X } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { formatPaidTotal, formatShortDate } from '@/lib/format/currency';
import ClientsPageGuide from '@/components/tribe-os/ClientsPageGuide';
import type { ClientListSort, ClientStatus, ClientWithStats } from '@/lib/dal/clients';

type ListState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; clients: ClientWithStats[] };

const copy = {
  en: {
    title: 'Clients',
    subtitle: 'Your private list',
    newClient: 'New client',
    searchPlaceholder: 'Search by name',
    emptyTitle: 'You have no clients yet',
    emptyHint: 'Add your first client to start tracking attendance and payments.',
    emptySearchTitle: 'No clients match',
    emptySearchHint: 'Try a different search.',
    loading: 'Loading',
    errorTitle: 'Something went wrong',
    retry: 'Retry',
    noSessionsYet: 'No sessions yet',
    sessionsCount: (n: number) => (n === 1 ? '1 session' : `${n} sessions`),
    redirectingLabel: 'Redirecting',
    paidNothingYet: 'No payments recorded',
    lastAttendance: 'Last:',
    statusLabels: {
      active: 'Active',
      inactive: 'Inactive',
      lead: 'Lead',
      lapsed: 'Lapsed',
    },
    filterAll: 'All',
    filterByStatus: 'Filter by status',
    filterByTag: 'Filter by tag',
    clearFilter: 'Clear',
    emptyFilteredTitle: 'No clients match these filters',
    emptyFilteredHint: 'Try clearing a filter or use a different search.',
    sortLabel: 'Sort',
    sortByLastSeen: 'Last seen',
    sortByName: 'Name (A–Z)',
    sortByCreated: 'Newest added',
  },
  // ES PENDING VERONICA REVIEW
  es: {
    title: 'Clientes',
    subtitle: 'Tu lista privada',
    newClient: 'Nuevo cliente',
    searchPlaceholder: 'Buscar por nombre',
    emptyTitle: 'Aún no tienes clientes',
    emptyHint: 'Agrega tu primer cliente para empezar a registrar asistencias y pagos.',
    emptySearchTitle: 'Ningún cliente coincide',
    emptySearchHint: 'Prueba una búsqueda diferente.',
    loading: 'Cargando',
    errorTitle: 'Algo salió mal',
    retry: 'Reintentar',
    noSessionsYet: 'Aún sin sesiones',
    sessionsCount: (n: number) => (n === 1 ? '1 sesión' : `${n} sesiones`),
    redirectingLabel: 'Redirigiendo',
    paidNothingYet: 'Sin pagos registrados',
    lastAttendance: 'Última:',
    statusLabels: {
      active: 'Activo',
      inactive: 'Inactivo',
      lead: 'Prospecto',
      lapsed: 'Suspendido',
    },
    filterAll: 'Todos',
    filterByStatus: 'Filtrar por estado',
    filterByTag: 'Filtrar por etiqueta',
    clearFilter: 'Limpiar',
    emptyFilteredTitle: 'Ningún cliente coincide con estos filtros',
    emptyFilteredHint: 'Prueba limpiar un filtro o usa otra búsqueda.',
    sortLabel: 'Ordenar',
    sortByLastSeen: 'Última visita',
    sortByName: 'Nombre (A–Z)',
    sortByCreated: 'Más recientes',
  },
} as const;

export default function ClientsListPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ClientStatus | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<ClientListSort>('last_seen_desc');
  const [list, setList] = useState<ListState>({ kind: 'loading' });
  // Keep a snapshot of the unfiltered roster (no status/tag filters,
  // no search) so the tag-pill row stays stable as the user filters —
  // otherwise filtering by a tag would hide other tags from the picker.
  const [allTagsSnapshot, setAllTagsSnapshot] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // Debounce the search input by 300ms before firing a new fetch.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setList({ kind: 'loading' });

    (async () => {
      try {
        const url = new URL('/api/tribe-os/clients/', window.location.origin);
        if (debouncedSearch.length > 0) url.searchParams.set('search', debouncedSearch);
        if (tagFilter) url.searchParams.set('tag', tagFilter);
        if (statusFilter) url.searchParams.set('status', statusFilter);
        // Only send sort when it's not the default — keeps the URL
        // tidy and the cache key smaller.
        if (sort !== 'last_seen_desc') url.searchParams.set('sort', sort);

        const res = await fetch(url.toString(), { method: 'GET' });
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
        const clients = body.data ?? [];
        setList({ kind: 'ready', clients });

        // Refresh the tag snapshot only when filters are clear, so
        // the tag-pill row reflects the whole roster and doesn't
        // disappear as the user narrows.
        if (debouncedSearch.length === 0 && !tagFilter && !statusFilter) {
          const tagSet = new Set<string>();
          for (const c of clients) {
            for (const t of c.tags ?? []) tagSet.add(t);
          }
          setAllTagsSnapshot(Array.from(tagSet).sort((a, b) => a.localeCompare(b)));
        }
      } catch {
        if (!cancelled) setList({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, debouncedSearch, tagFilter, statusFilter, sort, reloadKey, s.errorTitle]);

  // True when any filter is active beyond the unfiltered default.
  const anyFilterActive = useMemo(
    () => debouncedSearch.length > 0 || tagFilter !== null || statusFilter !== null,
    [debouncedSearch, tagFilter, statusFilter]
  );

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : ''}
        </p>
      </main>
    );
  }

  const isSearching = debouncedSearch.length > 0;

  return (
    <main className="text-white px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">{s.title}</h1>
          <p className="text-sm text-white/70 mt-1">{s.subtitle}</p>
        </header>

        <div className="flex flex-col sm:flex-row gap-3 mb-3">
          <Link
            href="/os/clients/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg shadow-[0_4px_20px_rgba(132,204,22,0.3)] hover:shadow-[0_6px_28px_rgba(132,204,22,0.45)] hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {s.newClient}
          </Link>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={s.searchPlaceholder}
              className="w-full pl-10 pr-4 py-2.5 bg-tribe-surface text-white placeholder:text-white/40 text-sm rounded-lg border border-tribe-mid focus:border-tribe-green focus:outline-none transition-colors"
            />
          </div>
        </div>

        {/* Filter pill rows. Only render when there are clients or
            filters active — keeps the zero-clients empty state clean. */}
        {list.kind === 'ready' && (list.clients.length > 0 || anyFilterActive) ? (
          <div className="mb-4 space-y-2">
            {/* Status filter */}
            <div className="flex items-center gap-1.5 flex-wrap" aria-label={s.filterByStatus}>
              <StatusPill active={statusFilter === null} label={s.filterAll} onClick={() => setStatusFilter(null)} />
              <StatusPill
                active={statusFilter === 'active'}
                label={s.statusLabels.active}
                onClick={() => setStatusFilter(statusFilter === 'active' ? null : 'active')}
              />
              <StatusPill
                active={statusFilter === 'lead'}
                label={s.statusLabels.lead}
                onClick={() => setStatusFilter(statusFilter === 'lead' ? null : 'lead')}
              />
              <StatusPill
                active={statusFilter === 'lapsed'}
                label={s.statusLabels.lapsed}
                onClick={() => setStatusFilter(statusFilter === 'lapsed' ? null : 'lapsed')}
              />
              <StatusPill
                active={statusFilter === 'inactive'}
                label={s.statusLabels.inactive}
                onClick={() => setStatusFilter(statusFilter === 'inactive' ? null : 'inactive')}
              />
            </div>

            {/* Tag filter — only render when we've seen any tags on
                the roster. Tags are user-defined so we don't know
                them ahead of time. */}
            {allTagsSnapshot.length > 0 ? (
              <div className="flex items-center gap-1.5 flex-wrap" aria-label={s.filterByTag}>
                {allTagsSnapshot.map((tag) => (
                  <TagPill
                    key={tag}
                    active={tagFilter === tag}
                    label={tag}
                    onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  />
                ))}
                {tagFilter ? (
                  <button
                    type="button"
                    onClick={() => setTagFilter(null)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-white/60 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                    {s.clearFilter}
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Sort selector — a single dropdown rather than a pill
                row because the choice is exclusive (one sort at a
                time) and we don't want to compete with the filter
                pills above. Inline aria-label so screen readers
                announce it as "Sort: <current>". */}
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase tracking-wider font-semibold text-white/50">{s.sortLabel}</label>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as ClientListSort)}
                className="bg-tribe-surface text-white text-xs font-semibold rounded-full border border-tribe-mid px-3 py-1 focus:border-tribe-green focus:outline-none"
              >
                <option value="last_seen_desc">{s.sortByLastSeen}</option>
                <option value="name_asc">{s.sortByName}</option>
                <option value="created_desc">{s.sortByCreated}</option>
              </select>
            </div>
          </div>
        ) : null}

        {list.kind === 'loading' ? (
          <p className="py-12 text-center text-sm text-white/60">{s.loading}…</p>
        ) : list.kind === 'error' ? (
          <ErrorState message={list.message} onRetry={() => setReloadKey((k) => k + 1)} retryLabel={s.retry} />
        ) : list.clients.length === 0 ? (
          <EmptyState
            title={anyFilterActive ? (isSearching ? s.emptySearchTitle : s.emptyFilteredTitle) : s.emptyTitle}
            hint={anyFilterActive ? (isSearching ? s.emptySearchHint : s.emptyFilteredHint) : s.emptyHint}
            ctaHref={anyFilterActive ? null : '/os/clients/new'}
            ctaLabel={s.newClient}
          />
        ) : (
          <ul className="space-y-2">
            {list.clients.map((c) => (
              <ClientRow key={c.id} client={c} language={language} copy={s} />
            ))}
          </ul>
        )}
      </div>

      {/* First-visit guide for this page. Auto-shows once per
          device; the seen-flag is independent from the Tribe.OS
          welcome guide on /os/dashboard so a user who skipped the
          dashboard tour still gets a chance to learn the clients
          page when they land here. */}
      <ClientsPageGuide enabled />
    </main>
  );
}

function ErrorState({ message, onRetry, retryLabel }: { message: string; onRetry: () => void; retryLabel: string }) {
  return (
    <div className="py-12 text-center space-y-4">
      <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
      <p className="text-sm text-white/80">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 bg-tribe-surface text-white text-sm font-semibold rounded-lg hover:bg-tribe-mid transition-colors"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function EmptyState({
  title,
  hint,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  hint: string;
  ctaHref: string | null;
  ctaLabel: string;
}) {
  return (
    <div className="py-12 text-center space-y-3">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      <p className="text-sm text-white/70 max-w-sm mx-auto leading-relaxed">{hint}</p>
      {ctaHref ? (
        <Link
          href={ctaHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-tribe-green text-tribe-dark text-sm font-bold rounded-lg mt-2 hover:-translate-y-0.5 transition-transform"
        >
          <Plus className="w-4 h-4" />
          {ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ClientRow({
  client,
  language,
  copy: s,
}: {
  client: ClientWithStats;
  language: 'en' | 'es';
  copy: typeof copy.en | typeof copy.es;
}) {
  const initial = (client.name?.charAt(0) ?? '?').toUpperCase();
  const lastAt = client.last_attendance_at ? formatShortDate(client.last_attendance_at, language) : null;
  const paid = formatPaidTotal(client.total_paid_cents_usd, client.total_paid_cents_cop, language);

  return (
    <li>
      <Link
        href={`/os/clients/${client.id}`}
        className="flex items-center gap-3 p-4 bg-tribe-surface rounded-xl border border-tribe-mid hover:border-tribe-green/50 hover:bg-tribe-mid/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-full bg-tribe-mid flex items-center justify-center text-base font-bold text-white shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{client.name}</p>
            <StatusBadge status={client.status} label={s.statusLabels[client.status]} />
          </div>
          <p className="text-xs text-white/60 mt-0.5 truncate">
            {lastAt ? `${s.lastAttendance} ${lastAt}` : s.noSessionsYet}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-white/80">{s.sessionsCount(client.total_attended_count)}</p>
          <p className="text-xs text-tribe-green font-semibold mt-0.5">{paid ?? s.paidNothingYet}</p>
        </div>
      </Link>
    </li>
  );
}

/**
 * Status pill. Active is the default state for any client so we don't
 * render a badge — keeps the row visually quiet for the common case.
 * Other statuses show a small color-coded pill.
 *
 *   lead     — amber  (potential, not started)
 *   inactive — neutral (explicitly stopped, no urgency)
 *   lapsed   — red    (stopped without explicit reactivation)
 */
function StatusBadge({ status, label }: { status: ClientWithStats['status']; label: string }) {
  if (status === 'active') return null;
  const tone =
    status === 'lapsed'
      ? 'bg-tribe-red/20 text-tribe-red border-tribe-red/40'
      : status === 'lead'
        ? 'bg-tribe-amber/20 text-tribe-amber border-tribe-amber/40'
        : 'bg-tribe-mid text-white/70 border-tribe-mid';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border shrink-0 ${tone}`}
    >
      {label}
    </span>
  );
}

/**
 * Status filter pill. "All" is the default un-filtered state. Each
 * status pill toggles its own filter on/off when clicked.
 */
function StatusPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
        active
          ? 'bg-tribe-green text-tribe-dark'
          : 'bg-tribe-surface text-white/70 hover:bg-tribe-mid hover:text-white border border-tribe-mid'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Tag filter pill. Tags are user-defined; we render them in
 * alphabetical order derived from the unfiltered roster snapshot.
 */
function TagPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
        active
          ? 'bg-tribe-green/20 text-tribe-green border border-tribe-green/40'
          : 'bg-tribe-surface text-white/60 hover:text-white hover:bg-tribe-mid border border-tribe-mid'
      }`}
    >
      {label}
    </button>
  );
}
