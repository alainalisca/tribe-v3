'use client';

/**
 * /os/teams/[id] — team detail page.
 *
 * Header: color stripe + team name + description + coach
 * Stats row: total members / active / at-risk
 * Member roster: scrollable list with avatar, name, status badge,
 *                last-seen indicator, remove button (owner only)
 * Footer actions: Add Member (owner only) + Edit (owner only) +
 *                 Delete (owner only)
 *
 * The Add Member picker is a modal that lists every non-archived
 * client in the gym, minus the ones already on this team. Search
 * filters by name client-side.
 *
 * Edit opens an inline form (name, description, color picker, coach
 * dropdown sourced from gym_coaches).
 *
 * Delete prompts a confirmation dialog; on confirm, the team is
 * deleted (cascades to gym_team_members) and the page redirects
 * back to /os/teams.
 */

import { useEffect, useState, useMemo, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  AlertCircle,
  Pencil,
  Trash2,
  UserPlus,
  UserMinus,
  MessageCircle,
  X as XIcon,
  Search,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { isValidUuid } from '@/lib/validations/uuid';
import { trackEvent } from '@/lib/analytics';
import { buildWhatsAppUrl } from '@/lib/phone';
import { Avatar, Badge, Button, Card, CardContent } from '@/components/tribe-os/ui';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import ReachOutToTeamModal from '@/components/tribe-os/ReachOutToTeamModal';
import type { GymTeamWithMembers, TeamColor } from '@/lib/dal/gymTeams';
import type { ClientWithStats } from '@/lib/dal/clients';

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'not_found' }
  | { kind: 'ready'; team: GymTeamWithMembers; isOwner: boolean };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    redirectingLabel: 'Redirecting',
    loadingLabel: 'Loading',
    backToTeams: 'Back to teams',
    coachLabel: 'Coach:',
    noCoach: 'Unassigned',
    membersCount: (n: number) => (n === 1 ? '1 member' : `${n} members`),
    activeCount: (n: number) => `${n} active`,
    atRiskCount: (n: number) => `${n} at risk`,
    addMember: 'Add Member',
    reachOut: 'Reach out to all',
    edit: 'Edit',
    delete: 'Delete',
    membersTitle: 'Members',
    noMembersTitle: 'No members yet',
    noMembersHint: 'Use the Add Member button to bring clients onto this team.',
    removeAria: 'Remove from team',
    messageAria: 'Message',
    notFoundTitle: 'Team not found',
    notFoundHint: 'This team may have been deleted, or the URL is malformed.',
    errorTitle: 'Could not load this team.',
    retry: 'Retry',
    statusActive: 'Active',
    statusWatch: 'Watch',
    statusAtRisk: 'At Risk',
    statusChurned: 'Churned',
    statusLead: 'Lead',
    statusInactive: 'Inactive',
    statusLapsed: 'Lapsed',
    lastSeenDaysAgo: (n: number) => (n === 1 ? '1 day ago' : `${n} days ago`),
    neverSeen: 'Never seen',
    addMemberModalTitle: 'Add a member to this team',
    addMemberModalHint: 'Pick a client from your roster. Members can belong to multiple teams.',
    searchPlaceholder: 'Search by name or email…',
    noClientsToAdd: 'Every active client is already on this team.',
    addingLabel: 'Adding',
    add: 'Add',
    cancel: 'Cancel',
    addError: 'Could not add this member.',
    editModalTitle: 'Edit team',
    nameLabel: 'Name',
    descriptionLabel: 'Description',
    colorLabel: 'Color',
    coachLabelForm: 'Head coach',
    coachUnassignedOption: 'Unassigned',
    coachLoading: 'Loading coaches…',
    save: 'Save',
    saving: 'Saving',
    saveError: 'Could not save changes.',
    duplicateName: 'A team with that name already exists.',
    deleteTitle: 'Delete this team?',
    deleteDesc:
      'The team and all its memberships will be removed. Client records, attendance, and revenue stay intact — only the team grouping is deleted.',
    deleting: 'Deleting',
    confirmDelete: 'Yes, delete team',
    deleteError: 'Could not delete the team.',
    whatsappCheckIn: (name: string) => `Hey ${name}! Just checking in — how's training going?`,
  },
  es: {
    redirectingLabel: 'Redirigiendo',
    loadingLabel: 'Cargando',
    backToTeams: 'Volver a equipos',
    coachLabel: 'Coach:',
    noCoach: 'Sin asignar',
    membersCount: (n: number) => (n === 1 ? '1 miembro' : `${n} miembros`),
    activeCount: (n: number) => `${n} activos`,
    atRiskCount: (n: number) => `${n} en riesgo`,
    addMember: 'Agregar miembro',
    reachOut: 'Contactar a todos',
    edit: 'Editar',
    delete: 'Eliminar',
    membersTitle: 'Miembros',
    noMembersTitle: 'Aún sin miembros',
    noMembersHint: 'Usa el botón Agregar miembro para sumar clientes a este equipo.',
    removeAria: 'Quitar del equipo',
    messageAria: 'Enviar mensaje',
    notFoundTitle: 'Equipo no encontrado',
    notFoundHint: 'Este equipo pudo haber sido eliminado, o la URL es inválida.',
    errorTitle: 'No se pudo cargar este equipo.',
    retry: 'Reintentar',
    statusActive: 'Activo',
    statusWatch: 'En seguimiento',
    statusAtRisk: 'En riesgo',
    statusChurned: 'Baja',
    statusLead: 'Prospecto',
    statusInactive: 'Inactivo',
    statusLapsed: 'Suspendido',
    lastSeenDaysAgo: (n: number) => (n === 1 ? 'hace 1 día' : `hace ${n} días`),
    neverSeen: 'Nunca visto',
    addMemberModalTitle: 'Agregar un miembro al equipo',
    addMemberModalHint: 'Elige un cliente de tu lista. Los miembros pueden pertenecer a varios equipos.',
    searchPlaceholder: 'Buscar por nombre o correo…',
    noClientsToAdd: 'Todos los clientes activos ya están en este equipo.',
    addingLabel: 'Agregando',
    add: 'Agregar',
    cancel: 'Cancelar',
    addError: 'No se pudo agregar este miembro.',
    editModalTitle: 'Editar equipo',
    nameLabel: 'Nombre',
    descriptionLabel: 'Descripción',
    colorLabel: 'Color',
    coachLabelForm: 'Coach principal',
    coachUnassignedOption: 'Sin asignar',
    coachLoading: 'Cargando entrenadores…',
    save: 'Guardar',
    saving: 'Guardando',
    saveError: 'No se pudieron guardar los cambios.',
    duplicateName: 'Ya existe un equipo con ese nombre.',
    deleteTitle: '¿Eliminar este equipo?',
    deleteDesc:
      'El equipo y todas sus membresías se eliminarán. Los registros de clientes, asistencia e ingresos se mantienen — solo se borra la agrupación.',
    deleting: 'Eliminando',
    confirmDelete: 'Sí, eliminar equipo',
    deleteError: 'No se pudo eliminar el equipo.',
    whatsappCheckIn: (name: string) => `¡Hola ${name}! Pasaba a saludarte. ¿Cómo va el entrenamiento?`,
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

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function daysAgo(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const t = new Date(dateIso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
}

export default function TeamDetailPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const teamId = params?.id;
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showReachOut, setShowReachOut] = useState(false);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    if (!teamId || !isValidUuid(teamId)) {
      setState({ kind: 'not_found' });
      return;
    }
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const [teamRes, gymRes] = await Promise.all([
          fetch(`/api/tribe-os/teams/${teamId}/`, { method: 'GET' }),
          fetch('/api/tribe-os/gym/', { method: 'GET' }),
        ]);
        if (cancelled) return;

        if (teamRes.status === 404) {
          setState({ kind: 'not_found' });
          return;
        }

        const teamBody = (await teamRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: GymTeamWithMembers;
          error?: string;
        };
        const gymBody = (await gymRes.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { is_owner?: boolean };
        };

        if (!teamRes.ok || !teamBody.success || !teamBody.data) {
          setState({ kind: 'error', message: teamBody.error || s.errorTitle });
          return;
        }
        setState({
          kind: 'ready',
          team: teamBody.data,
          isOwner: gymBody.data?.is_owner ?? false,
        });
        trackEvent('tribe_os_team_detail_viewed', { member_count: teamBody.data.members.length });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, teamId, reloadKey, s.errorTitle]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  // Derived counts for the stats strip
  const activeCount =
    state.kind === 'ready'
      ? state.team.members.filter((m) => m.status === 'active' && (m.health_status ?? 'HEALTHY') !== 'AT_RISK').length
      : 0;
  const atRiskCount =
    state.kind === 'ready'
      ? state.team.members.filter((m) => m.health_status === 'AT_RISK' || m.status === 'lapsed').length
      : 0;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <Link
          href="/os/teams"
          className="inline-flex items-center gap-1 text-xs text-tribe-dark-80 hover:text-tribe-dark"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {s.backToTeams}
        </Link>

        {state.kind === 'loading' ? (
          <div className="h-64 bg-white rounded-tribe shadow-tribe animate-pulse" />
        ) : state.kind === 'not_found' ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <h2 className="text-lg font-bold text-tribe-dark">{s.notFoundTitle}</h2>
              <p className="text-sm text-tribe-dark-80">{s.notFoundHint}</p>
            </CardContent>
          </Card>
        ) : state.kind === 'error' ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-tribe-danger mx-auto" />
              <p className="text-sm text-tribe-dark">{state.message}</p>
              <Button onClick={() => setReloadKey((k) => k + 1)} variant="secondary" size="sm">
                {s.retry}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Header card */}
            <Card className="overflow-hidden">
              <div className={`h-1.5 ${STRIPE_COLOR[state.team.color]}`} aria-hidden="true" />
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-tribe-dark">{state.team.name}</h1>
                    {state.team.description ? (
                      <p className="text-sm text-tribe-dark-80 mt-1">{state.team.description}</p>
                    ) : null}
                  </div>
                  {state.isOwner ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => setShowEdit(true)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        {s.edit}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowDelete(true)}>
                        <Trash2 className="w-4 h-4 mr-1 text-tribe-danger" />
                        {s.delete}
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-tribe-dark">{state.team.members.length}</span>
                    <span className="text-sm text-tribe-dark-80">
                      {s.membersCount(state.team.members.length).split(' ').slice(1).join(' ')}
                    </span>
                  </div>
                  {activeCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-tribe-success" />
                      <span className="text-sm text-tribe-dark-80">{s.activeCount(activeCount)}</span>
                    </div>
                  ) : null}
                  {atRiskCount > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-tribe-warning" />
                      <span className="text-sm text-tribe-dark-80">{s.atRiskCount(atRiskCount)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <Avatar initials={(state.team.coach_name?.charAt(0) || '?').toUpperCase()} size="sm" />
                  <p className="text-sm text-tribe-dark-80">
                    <span className="text-tribe-dark-60">{s.coachLabel}</span>{' '}
                    <span className="font-semibold text-tribe-dark">{state.team.coach_name || s.noCoach}</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Members list */}
            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-tribe-dark-40">
                  <h2 className="text-base font-semibold text-tribe-dark">{s.membersTitle}</h2>
                  <div className="flex items-center gap-2">
                    {/* Reach-out is available to every coach who can see
                        the team (the RLS gate already ran), not just
                        owners — pre-session check-ins are a coach-level
                        action, not an admin one. Hidden when there are
                        no members yet because the modal would just show
                        an empty roster. */}
                    {state.team.members.length > 0 ? (
                      <Button size="sm" variant="secondary" onClick={() => setShowReachOut(true)}>
                        <MessageCircle className="w-4 h-4 mr-1" />
                        {s.reachOut}
                      </Button>
                    ) : null}
                    {state.isOwner ? (
                      <Button size="sm" onClick={() => setShowAdd(true)}>
                        <UserPlus className="w-4 h-4 mr-1" />
                        {s.addMember}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {state.team.members.length === 0 ? (
                  <div className="py-12 px-6 text-center">
                    <p className="text-sm font-semibold text-tribe-dark mb-1">{s.noMembersTitle}</p>
                    <p className="text-xs text-tribe-dark-80">{s.noMembersHint}</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-tribe-dark-40">
                    {state.team.members.map((m) => (
                      <MemberRow
                        key={m.id}
                        member={m}
                        copy={s}
                        teamId={state.team.id}
                        isOwner={state.isOwner}
                        onChanged={() => setReloadKey((k) => k + 1)}
                      />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {showAdd ? (
              <AddMemberModal
                teamId={state.team.id}
                existingMemberIds={new Set(state.team.members.map((m) => m.id))}
                copy={s}
                onClose={() => setShowAdd(false)}
                onAdded={() => {
                  setShowAdd(false);
                  setReloadKey((k) => k + 1);
                }}
              />
            ) : null}

            {showReachOut ? <ReachOutToTeamModal team={state.team} onClose={() => setShowReachOut(false)} /> : null}

            {showEdit ? (
              <EditTeamModal
                team={state.team}
                copy={s}
                onClose={() => setShowEdit(false)}
                onSaved={() => {
                  setShowEdit(false);
                  setReloadKey((k) => k + 1);
                }}
              />
            ) : null}

            <Dialog open={showDelete} onOpenChange={(v) => !v && setShowDelete(false)}>
              <DialogContent className="max-w-sm rounded-tribe p-6 bg-white border border-tribe-dark-40 text-tribe-dark">
                <DialogTitle className="text-lg font-bold text-tribe-danger">{s.deleteTitle}</DialogTitle>
                <p className="text-sm text-tribe-dark-80 mt-2 leading-relaxed">{s.deleteDesc}</p>
                <DeleteTeamActions
                  teamId={state.team.id}
                  copy={s}
                  onCancel={() => setShowDelete(false)}
                  onDeleted={() => router.push('/os/teams')}
                />
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  copy: s,
  teamId,
  isOwner,
  onChanged,
}: {
  member: GymTeamWithMembers['members'][number];
  copy: typeof copy.en | typeof copy.es;
  teamId: string;
  isOwner: boolean;
  onChanged: () => void;
}) {
  const [removing, setRemoving] = useState(false);
  const initials = initialsFromName(member.name);
  const days = daysAgo(member.last_seen_at);

  // Derived status display
  let badgeVariant: 'success' | 'warning' | 'danger' | 'info' | 'default' = 'default';
  let badgeLabel: string = '—';
  if (member.health_status === 'AT_RISK' || member.status === 'lapsed') {
    badgeVariant = 'danger';
    badgeLabel = s.statusAtRisk;
  } else if (member.health_status === 'WATCH') {
    badgeVariant = 'warning';
    badgeLabel = s.statusWatch;
  } else if (member.status === 'active') {
    badgeVariant = 'success';
    badgeLabel = s.statusActive;
  } else if (member.status === 'lead') {
    badgeVariant = 'info';
    badgeLabel = s.statusLead;
  } else if (member.status === 'inactive') {
    badgeVariant = 'default';
    badgeLabel = s.statusInactive;
  }

  const firstName = member.name.split(' ')[0] || member.name;
  const waUrl = buildWhatsAppUrl(member.phone, { message: s.whatsappCheckIn(firstName) });

  async function handleRemove() {
    if (removing) return;
    setRemoving(true);
    try {
      const url = new URL(`/api/tribe-os/teams/${teamId}/members/`, window.location.origin);
      url.searchParams.set('client_id', member.id);
      const res = await fetch(url.toString(), { method: 'DELETE' });
      if (res.ok) {
        trackEvent('tribe_os_team_member_removed');
        onChanged();
      }
    } finally {
      setRemoving(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-6 py-3">
      <Link href={`/os/clients/${member.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar initials={initials} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-tribe-dark truncate">{member.name}</p>
          <p className="text-xs text-tribe-dark-80 truncate">
            {member.email ?? '—'}
            {days != null ? <span className="ml-2">· {s.lastSeenDaysAgo(days)}</span> : null}
          </p>
        </div>
      </Link>
      <Badge variant={badgeVariant}>{badgeLabel}</Badge>
      {waUrl ? (
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={s.messageAria}
          className="p-1.5 text-tribe-dark-80 hover:text-tribe-dark hover:bg-tribe-dark-40 rounded-tribe transition-colors"
          onClick={() => trackEvent('tribe_os_whatsapp_clicked', { surface: 'team_detail' })}
        >
          <MessageCircle className="w-4 h-4" />
        </a>
      ) : null}
      {isOwner ? (
        <button
          type="button"
          aria-label={s.removeAria}
          onClick={handleRemove}
          disabled={removing}
          className="p-1.5 text-tribe-dark-80 hover:text-tribe-danger hover:bg-red-50 rounded-tribe transition-colors disabled:opacity-50"
        >
          <UserMinus className="w-4 h-4" />
        </button>
      ) : null}
    </li>
  );
}

function AddMemberModal({
  teamId,
  existingMemberIds,
  copy: s,
  onClose,
  onAdded,
}: {
  teamId: string;
  existingMemberIds: Set<string>;
  copy: typeof copy.en | typeof copy.es;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [clients, setClients] = useState<ClientWithStats[] | null>(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/clients/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as { success?: boolean; data?: ClientWithStats[] };
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setClients([]);
          return;
        }
        setClients(body.data ?? []);
      } catch {
        if (!cancelled) setClients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const candidates = useMemo(() => {
    if (!clients) return [];
    const term = search.trim().toLowerCase();
    return clients
      .filter((c) => !existingMemberIds.has(c.id))
      .filter((c) => {
        if (term.length === 0) return true;
        return c.name.toLowerCase().includes(term) || (c.email && c.email.toLowerCase().includes(term));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, search, existingMemberIds]);

  async function handleAdd(clientId: string) {
    if (submitting) return;
    setSubmitting(clientId);
    setError(null);
    try {
      const res = await fetch(`/api/tribe-os/teams/${teamId}/members/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        setError(s.addError);
        setSubmitting(null);
        return;
      }
      trackEvent('tribe_os_team_member_added');
      onAdded();
    } catch {
      setError(s.addError);
      setSubmitting(null);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-tribe p-5 bg-white border border-tribe-dark-40 text-tribe-dark">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <DialogTitle className="text-base font-bold text-tribe-dark">{s.addMemberModalTitle}</DialogTitle>
            <p className="text-xs text-tribe-dark-80 mt-1">{s.addMemberModalHint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.cancel}
            className="p-1 -m-1 text-tribe-dark-80 hover:text-tribe-dark"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="w-4 h-4 text-tribe-dark-60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={s.searchPlaceholder}
            className="w-full pl-10 pr-3 py-2 text-sm bg-white border-2 border-tribe-dark-40 rounded-tribe focus:outline-none focus:border-tribe-green focus:ring-1 focus:ring-tribe-green-50"
          />
        </div>

        {error ? (
          <div className="mb-3 flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-tribe text-xs text-tribe-danger">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        {clients === null ? (
          <div className="py-8 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 bg-tribe-dark-40 rounded-tribe animate-pulse" />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-tribe-dark-80">{s.noClientsToAdd}</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto divide-y divide-tribe-dark-40 -mx-2">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-2 py-2.5">
                <Avatar initials={initialsFromName(c.name)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-tribe-dark truncate">{c.name}</p>
                  {c.email ? <p className="text-xs text-tribe-dark-80 truncate">{c.email}</p> : null}
                </div>
                <Button size="sm" disabled={submitting !== null} onClick={() => handleAdd(c.id)}>
                  {submitting === c.id ? `${s.addingLabel}…` : s.add}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditTeamModal({
  team,
  copy: s,
  onClose,
  onSaved,
}: {
  team: GymTeamWithMembers;
  copy: typeof copy.en | typeof copy.es;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? '');
  const [color, setColor] = useState<TeamColor>(team.color);
  const [coachUserId, setCoachUserId] = useState<string | null>(team.coach_user_id);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Coach roster for the dropdown. Null while loading, [] when no
  // coaches yet (only the owner exists), otherwise the populated
  // list filtered to non-owner roles + the owner row itself.
  const [coaches, setCoaches] = useState<Array<{ user_id: string; name: string; role: string }> | null>(null);

  // Lazy-load the coach roster on mount. Reuses the existing
  // /api/tribe-os/coaches endpoint which already returns the full
  // gym roster including the owner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/coaches/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { coaches?: Array<{ user_id: string; role: string; user: { name: string } | null }> };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data?.coaches) {
          setCoaches([]);
          return;
        }
        setCoaches(
          body.data.coaches.map((c) => ({
            user_id: c.user_id,
            name: c.user?.name ?? 'Unknown',
            role: c.role,
          }))
        );
      } catch {
        if (!cancelled) setCoaches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tribe-os/teams/${team.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          color,
          coach_user_id: coachUserId,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        setError(body.error === 'duplicate_name' ? s.duplicateName : s.saveError);
        setSubmitting(false);
        return;
      }
      trackEvent('tribe_os_team_updated');
      onSaved();
    } catch {
      setError(s.saveError);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && !submitting && onClose()}>
      <DialogContent className="max-w-md rounded-tribe p-5 bg-white border border-tribe-dark-40 text-tribe-dark">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <DialogTitle className="text-base font-bold text-tribe-dark">{s.editModalTitle}</DialogTitle>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              aria-label={s.cancel}
              className="p-1 -m-1 text-tribe-dark-80 hover:text-tribe-dark"
            >
              <XIcon className="w-4 h-4" />
            </button>
          </div>

          <label className="block">
            <span className="block text-xs font-semibold text-tribe-dark mb-1">{s.nameLabel}</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={submitting}
              className="w-full px-3 py-2 bg-white border-2 border-tribe-dark-40 rounded-tribe text-sm focus:outline-none focus:border-tribe-green focus:ring-1 focus:ring-tribe-green-50 disabled:opacity-60"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-tribe-dark mb-1">{s.descriptionLabel}</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              disabled={submitting}
              className="w-full px-3 py-2 bg-white border-2 border-tribe-dark-40 rounded-tribe text-sm focus:outline-none focus:border-tribe-green focus:ring-1 focus:ring-tribe-green-50 disabled:opacity-60 resize-none"
            />
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-tribe-dark mb-1">{s.coachLabelForm}</span>
            <select
              value={coachUserId ?? ''}
              onChange={(e) => setCoachUserId(e.target.value || null)}
              disabled={submitting || coaches === null}
              className="w-full px-3 py-2 bg-white border-2 border-tribe-dark-40 rounded-tribe text-sm focus:outline-none focus:border-tribe-green focus:ring-1 focus:ring-tribe-green-50 disabled:opacity-60"
            >
              <option value="">{coaches === null ? s.coachLoading : s.coachUnassignedOption}</option>
              {(coaches ?? []).map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.name}
                  {c.role === 'owner' ? ' (owner)' : ''}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="block text-xs font-semibold text-tribe-dark mb-2">{s.colorLabel}</span>
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
            <div className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-200 rounded-tribe text-xs text-tribe-danger">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
              {s.cancel}
            </Button>
            <Button type="submit" disabled={submitting || name.trim().length === 0} loading={submitting}>
              {submitting ? s.saving : s.save}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteTeamActions({
  teamId,
  copy: s,
  onCancel,
  onDeleted,
}: {
  teamId: string;
  copy: typeof copy.en | typeof copy.es;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tribe-os/teams/${teamId}/`, { method: 'DELETE' });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean };
      if (!res.ok || !body.success) {
        setError(s.deleteError);
        setSubmitting(false);
        return;
      }
      trackEvent('tribe_os_team_deleted');
      onDeleted();
    } catch {
      setError(s.deleteError);
      setSubmitting(false);
    }
  }

  return (
    <>
      {error ? (
        <div className="flex items-start gap-2 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-tribe text-xs text-tribe-danger">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      ) : null}
      <div className="flex gap-3 mt-5">
        <Button variant="secondary" onClick={onCancel} disabled={submitting} className="flex-1">
          {s.cancel}
        </Button>
        <Button variant="danger" onClick={handleDelete} disabled={submitting} loading={submitting} className="flex-1">
          {submitting ? s.deleting : s.confirmDelete}
        </Button>
      </div>
    </>
  );
}
