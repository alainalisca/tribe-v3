'use client';

/**
 * /os/teams — list of teams in the caller's gym (matches mockup 1).
 *
 * Each team is a card showing:
 *   - Colored top stripe (six color options)
 *   - Name + description
 *   - Member count + status breakdown (X active, Y at risk)
 *   - Head coach (avatar + name)
 *   - Member avatar preview + "+N" overflow chip
 *   - "View Members" affordance
 *
 * Data: GET /api/tribe-os/teams returns each team with aggregated
 * stats (member_count, active_count, at_risk_count, preview_members)
 * via the list_teams_for_gym RPC.
 *
 * Creating a team: a "Create Team" button at the top right opens an
 * inline form. Owner-only — non-owners see the button disabled.
 */

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Plus, MessageSquare, Search, AlertCircle, X as XIcon, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { Avatar, Button, Card, CardContent } from '@/components/tribe-os/ui';
import type { GymTeamWithStats, TeamColor } from '@/lib/dal/gymTeams';

interface ListResponse {
  gym: { id: string; name: string };
  teams: GymTeamWithStats[];
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'no_gym' }
  | { kind: 'ready'; gym: ListResponse['gym']; teams: GymTeamWithStats[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    redirectingLabel: 'Redirecting',
    loadingLabel: 'Loading',
    pageTitle: 'Teams',
    teamSummary: (n: number, members: number) =>
      `${n} ${n === 1 ? 'team' : 'teams'} · ${members} unique ${members === 1 ? 'member' : 'members'}`,
    createTeam: 'Create Team',
    searchPlaceholder: 'Search teams…',
    members: (n: number) => (n === 1 ? '1 member' : `${n} members`),
    activeShort: (n: number) => `${n} active`,
    atRiskShort: (n: number) => `${n} at risk`,
    healthyShort: (n: number) => `${n} healthy`,
    watchShort: (n: number) => `${n} watch`,
    healthSnapshotLabel: 'Health',
    healthAllClear: 'All healthy',
    coachLabel: 'Coach:',
    noCoach: 'Unassigned',
    viewMembers: 'View Members',
    noTeamsTitle: 'No teams yet',
    noTeamsHint:
      'Group your members by program, time slot, or training focus. Teams help you message and track in bulk.',
    noTeamsCta: 'Create your first team',
    noMatch: 'No teams match your search.',
    errorTitle: 'Could not load teams.',
    retry: 'Retry',
    noGymTitle: 'No gym yet',
    noGymHint: 'A gym is created automatically when you subscribe to Tribe.OS premium.',
    // Inline form
    formTitle: 'Create team',
    formNameLabel: 'Name',
    formNamePlaceholder: 'e.g. Morning Crew',
    formDescriptionLabel: 'Description (optional)',
    formDescriptionPlaceholder: 'A short note about who this team is for',
    formColorLabel: 'Color',
    formSubmit: 'Create',
    formSubmitting: 'Creating',
    formCancel: 'Cancel',
    formDuplicate: 'A team with that name already exists.',
    formError: 'Could not create team.',
  },
  es: {
    redirectingLabel: 'Redirigiendo',
    loadingLabel: 'Cargando',
    pageTitle: 'Equipos',
    teamSummary: (n: number, members: number) =>
      `${n} ${n === 1 ? 'equipo' : 'equipos'} · ${members} ${members === 1 ? 'miembro único' : 'miembros únicos'}`,
    createTeam: 'Crear equipo',
    searchPlaceholder: 'Buscar equipos…',
    members: (n: number) => (n === 1 ? '1 miembro' : `${n} miembros`),
    activeShort: (n: number) => `${n} activos`,
    atRiskShort: (n: number) => `${n} en riesgo`,
    healthyShort: (n: number) => `${n} saludables`,
    watchShort: (n: number) => `${n} en seguimiento`,
    healthSnapshotLabel: 'Salud',
    healthAllClear: 'Todos saludables',
    coachLabel: 'Coach:',
    noCoach: 'Sin asignar',
    viewMembers: 'Ver miembros',
    noTeamsTitle: 'Aún sin equipos',
    noTeamsHint:
      'Agrupa a tus miembros por programa, horario o enfoque de entrenamiento. Los equipos ayudan a enviar mensajes y monitorear en bloque.',
    noTeamsCta: 'Crear tu primer equipo',
    noMatch: 'Ningún equipo coincide con tu búsqueda.',
    errorTitle: 'No se pudieron cargar los equipos.',
    retry: 'Reintentar',
    noGymTitle: 'Aún sin gym',
    noGymHint: 'Se crea un gym automáticamente al suscribirte a Tribe.OS premium.',
    formTitle: 'Crear equipo',
    formNameLabel: 'Nombre',
    formNamePlaceholder: 'p.ej. Crew de la mañana',
    formDescriptionLabel: 'Descripción (opcional)',
    formDescriptionPlaceholder: 'Una nota breve sobre para quién es este equipo',
    formColorLabel: 'Color',
    formSubmit: 'Crear',
    formSubmitting: 'Creando',
    formCancel: 'Cancelar',
    formDuplicate: 'Ya existe un equipo con ese nombre.',
    formError: 'No se pudo crear el equipo.',
  },
} as const;

const STRIPE_COLOR: Record<TeamColor, string> = {
  lime: 'bg-tribe-green',
  blue: 'bg-blue-500',
  amber: 'bg-amber-500',
  red: 'bg-tribe-red',
  purple: 'bg-purple-500',
  slate: 'bg-slate-500',
};

export default function TeamsPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch('/api/tribe-os/teams/', { method: 'GET' });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'no_gym' });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: ListResponse;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.errorTitle });
          return;
        }
        setState({ kind: 'ready', gym: body.data.gym, teams: body.data.teams });
        trackEvent('tribe_os_teams_viewed', { team_count: body.data.teams.length });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, reloadKey, s.errorTitle]);

  const filteredTeams =
    state.kind === 'ready' && search.trim().length > 0
      ? state.teams.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()))
      : state.kind === 'ready'
        ? state.teams
        : [];

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-gray-500 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  const uniqueMemberCount =
    state.kind === 'ready' ? new Set(state.teams.flatMap((t) => t.preview_members.map((m) => m.id))).size : 0;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">{s.pageTitle}</h1>
            {state.kind === 'ready' ? (
              <p className="text-sm text-gray-500 mt-1">{s.teamSummary(state.teams.length, uniqueMemberCount)}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-tribe-green text-tribe-dark text-sm font-bold rounded-xl hover:shadow-[0_4px_20px_rgba(132,204,22,0.25)] hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {s.createTeam}
          </button>
        </header>

        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={s.searchPlaceholder}
            className="w-full pl-10 pr-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
          />
        </div>

        {state.kind === 'loading' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-48 bg-white rounded-xl border border-gray-200 animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'no_gym' ? (
          <div className="py-12 text-center space-y-2">
            <h2 className="text-lg font-bold text-gray-900">{s.noGymTitle}</h2>
            <p className="text-sm text-gray-600">{s.noGymHint}</p>
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-gray-700">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-gray-100 text-gray-900 text-sm font-semibold rounded-lg hover:bg-gray-200"
            >
              {s.retry}
            </button>
          </div>
        ) : state.teams.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-semibold text-gray-900">{s.noTeamsTitle}</p>
            <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">{s.noTeamsHint}</p>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 bg-tribe-green text-tribe-dark text-xs font-bold rounded-full"
            >
              <Plus className="w-3.5 h-3.5" />
              {s.noTeamsCta}
            </button>
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-500">{s.noMatch}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredTeams.map((t) => (
              <TeamCard key={t.id} team={t} copy={s} />
            ))}
          </div>
        )}
      </div>

      {showCreate ? (
        <CreateTeamModal
          copy={s}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            setReloadKey((k) => k + 1);
          }}
        />
      ) : null}
    </div>
  );
}

function TeamCard({ team, copy: s }: { team: GymTeamWithStats; copy: typeof copy.en | typeof copy.es }) {
  const coachInitial = (team.coach_name?.charAt(0) || '?').toUpperCase();
  const preview = team.preview_members.slice(0, 5);
  const overflow = Math.max(0, team.member_count - preview.length);

  return (
    <Card className="overflow-hidden">
      {/* Color stripe at top — matches the canonical tribe-os team-card. */}
      <div className={`h-1.5 ${STRIPE_COLOR[team.color]}`} aria-hidden="true" />
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-tribe-dark truncate">{team.name}</h3>
            {team.description ? (
              <p className="text-sm text-tribe-dark-80 mt-1 line-clamp-2">{team.description}</p>
            ) : null}
          </div>
          <div className="ml-4 shrink-0">
            <Button variant="ghost" size="sm" title="Message team" aria-label="Message team">
              <MessageSquare className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stats row — large member count + three-bucket health snapshot.
            Health buckets come from the AI-aware list_teams_for_gym
            RPC (migration 080): healthy / watch / at_risk. We render
            only the non-zero buckets so a tidy team doesn't carry
            empty pills, and fall back to "All healthy" when the team
            has members but every bucket but healthy is zero. */}
        <div className="flex items-center gap-6 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-tribe-dark">{team.member_count}</span>
            <span className="text-sm text-tribe-dark-80">
              {team.member_count === 1
                ? (s.members(1).split(' ').slice(1).join(' ') ?? '')
                : (s.members(team.member_count).split(' ').slice(1).join(' ') ?? '')}
            </span>
          </div>
          <HealthSnapshot healthy={team.healthy_count} watch={team.watch_count} atRisk={team.at_risk_count} copy={s} />
        </div>

        {/* Coach line + stacked member avatars */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar initials={coachInitial} size="sm" />
            <p className="text-sm text-tribe-dark-80 truncate">
              <span className="text-tribe-dark-60">{s.coachLabel}</span>{' '}
              <span className="font-semibold text-tribe-dark">{team.coach_name || s.noCoach}</span>
            </p>
          </div>
          {preview.length > 0 ? (
            <div className="flex items-center -space-x-2 shrink-0">
              {preview.map((m) => (
                <Avatar
                  key={m.id}
                  initials={(m.name.charAt(0) || '?').toUpperCase()}
                  size="sm"
                  className="border-2 border-white"
                  title={m.name}
                />
              ))}
              {overflow > 0 ? (
                <span className="h-8 w-8 rounded-full bg-tribe-dark-40 flex items-center justify-center border-2 border-white text-xs font-semibold text-tribe-dark-80">
                  +{overflow}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* View Members link — links to the (future) detail page */}
        <Link
          href={`/os/teams/${team.id}`}
          className="w-full mt-4 pt-4 border-t border-tribe-dark-40 flex items-center justify-center gap-2 text-sm text-tribe-dark-80 hover:text-tribe-green-dark transition-colors"
        >
          {s.viewMembers}
          <ChevronDown className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

/**
 * HealthSnapshot — pills showing the at-risk / watch / healthy
 * breakdown for a team card. Renders only buckets with non-zero
 * counts so a healthy team stays visually quiet, and collapses to
 * a single "All healthy" badge when only the healthy bucket has
 * members. Empty teams render nothing.
 *
 * Order is deliberate: at-risk first (the most actionable), watch
 * second, healthy last. That way a coach's eye lands on the
 * problem column first when scanning a long team list.
 */
function HealthSnapshot({
  healthy,
  watch,
  atRisk,
  copy: s,
}: {
  healthy: number;
  watch: number;
  atRisk: number;
  copy: typeof copy.en | typeof copy.es;
}) {
  // Empty team (no clients in the active/lapsed health math) renders
  // nothing — the parent's member_count already covers "this team is
  // empty" messaging.
  if (healthy === 0 && watch === 0 && atRisk === 0) return null;

  // Tidy collapse: when only healthy is non-zero, swap the per-pill
  // breakdown for a single "All healthy" badge. Keeps the most common
  // state from feeling cluttered.
  if (atRisk === 0 && watch === 0 && healthy > 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-tribe-success" />
        <span className="text-sm text-tribe-dark-80">{s.healthAllClear}</span>
      </div>
    );
  }

  return (
    <>
      {atRisk > 0 ? (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-tribe-danger" />
          <span className="text-sm text-tribe-dark-80">{s.atRiskShort(atRisk)}</span>
        </div>
      ) : null}
      {watch > 0 ? (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-tribe-warning" />
          <span className="text-sm text-tribe-dark-80">{s.watchShort(watch)}</span>
        </div>
      ) : null}
      {healthy > 0 ? (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-tribe-success" />
          <span className="text-sm text-tribe-dark-80">{s.healthyShort(healthy)}</span>
        </div>
      ) : null}
    </>
  );
}

/** Inline create-team form rendered as a modal-style overlay. */
function CreateTeamModal({
  copy: s,
  onClose,
  onCreated,
}: {
  copy: typeof copy.en | typeof copy.es;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<TeamColor>('lime');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/tribe-os/teams/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        if (body.error === 'duplicate_name') {
          setError(s.formDuplicate);
        } else {
          setError(s.formError);
        }
        setSubmitting(false);
        return;
      }
      trackEvent('tribe_os_team_created');
      onCreated();
    } catch {
      setError(s.formError);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-gray-900">{s.formTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.formCancel}
            className="w-8 h-8 inline-flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">{s.formNameLabel}</span>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={s.formNamePlaceholder}
            maxLength={80}
            disabled={submitting}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20 disabled:opacity-60"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">{s.formDescriptionLabel}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={s.formDescriptionPlaceholder}
            maxLength={500}
            rows={2}
            disabled={submitting}
            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20 disabled:opacity-60 resize-none"
          />
        </label>

        <div>
          <span className="block text-xs font-semibold text-gray-700 mb-2">{s.formColorLabel}</span>
          <div className="flex items-center gap-2">
            {(['lime', 'blue', 'amber', 'red', 'purple', 'slate'] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => setColor(c)}
                disabled={submitting}
                className={`w-8 h-8 rounded-full transition-transform ${STRIPE_COLOR[c]} ${
                  color === c ? 'ring-2 ring-offset-2 ring-tribe-dark scale-110' : 'hover:scale-105'
                }`}
              />
            ))}
          </div>
        </div>

        {error ? (
          <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-60"
          >
            {s.formCancel}
          </button>
          <button
            type="submit"
            disabled={submitting || name.trim().length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-tribe-green text-tribe-dark text-xs font-bold rounded-lg disabled:opacity-60 disabled:cursor-not-allowed hover:shadow transition-all"
          >
            {submitting ? `${s.formSubmitting}…` : s.formSubmit}
          </button>
        </div>
      </form>
    </div>
  );
}
