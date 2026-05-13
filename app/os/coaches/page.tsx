'use client';

/**
 * /os/coaches — read-only coach roster for the gym.
 *
 * Surfaces the multi-coach data model now that the gym-tenant
 * scaffolding is in place. List view only; invite + remove flow
 * lands when beta has real instructors who need to add coaches.
 *
 * Owner row is rendered first with a distinct "OWNER" badge. Other
 * coaches and assistants follow in created_at order. Empty state
 * (gym exists with just one coach — the owner) shows an
 * "Only you for now" affirmation.
 */

import { useEffect, useState } from 'react';
import { Users, Crown, AlertCircle, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import CoachesPageGuide from '@/components/tribe-os/CoachesPageGuide';
import InviteCoachForm from '@/components/tribe-os/InviteCoachForm';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { GymCoachWithUser } from '@/lib/dal/gymCoaches';

interface RosterResponse {
  gym: { id: string; name: string; slug: string };
  coaches: GymCoachWithUser[];
  is_owner: boolean;
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'no_gym' }
  | { kind: 'ready'; gym: RosterResponse['gym']; coaches: GymCoachWithUser[]; isOwner: boolean };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    backLabel: 'Back to dashboard',
    title: 'Coaches',
    subtitle: 'Everyone who can manage this gym.',
    loading: 'Loading',
    error: 'Could not load the coach roster.',
    retry: 'Retry',
    redirectingLabel: 'Redirecting',
    noGymTitle: 'No gym yet',
    noGymHint:
      'A gym is created automatically when you subscribe to Tribe.OS premium. If you see this message, something is off — reach out and we will fix it.',
    onlyYouTitle: 'Only you for now',
    onlyYouHint: 'You are the only coach in this gym. Use "Add a coach" below to bring on another instructor.',
    onlyYouHintNonOwner: 'You are the only coach in this gym. The gym owner can add more coaches.',
    roleOwner: 'Owner',
    roleCoach: 'Coach',
    roleAssistant: 'Assistant',
    gymLabel: 'Gym',
    inviteSoonNotice: 'Only the gym owner can add or remove coaches.',
    removeAria: 'Remove this coach',
    removeTitle: 'Remove from gym?',
    removeDescription: (name: string) =>
      `${name} will lose access to this gym's clients, attendance, and revenue. Their own Tribe account is untouched.`,
    removeConfirm: 'Yes, remove',
    removeCancel: 'Cancel',
    removeLoading: 'Removing',
    removeError: 'Could not remove coach.',
  },
  es: {
    backLabel: 'Volver al panel',
    title: 'Entrenadores',
    subtitle: 'Todos los que pueden gestionar este gym.',
    loading: 'Cargando',
    error: 'No se pudo cargar el equipo de entrenadores.',
    retry: 'Reintentar',
    redirectingLabel: 'Redirigiendo',
    noGymTitle: 'Aún sin gym',
    noGymHint:
      'Se crea un gym automáticamente al suscribirte a Tribe.OS premium. Si ves este mensaje, algo está raro — escríbenos y lo arreglamos.',
    onlyYouTitle: 'Solo tú por ahora',
    onlyYouHint: 'Eres el único entrenador en este gym. Usa "Agregar entrenador" abajo para sumar a otro instructor.',
    onlyYouHintNonOwner: 'Eres el único entrenador en este gym. El propietario puede agregar más entrenadores.',
    roleOwner: 'Propietario',
    roleCoach: 'Entrenador',
    roleAssistant: 'Asistente',
    gymLabel: 'Gym',
    inviteSoonNotice: 'Solo el propietario del gym puede agregar o quitar entrenadores.',
    removeAria: 'Quitar a este entrenador',
    removeTitle: '¿Quitar del gym?',
    removeDescription: (name: string) =>
      `${name} perderá acceso a los clientes, asistencias e ingresos de este gym. Su cuenta de Tribe no se toca.`,
    removeConfirm: 'Sí, quitar',
    removeCancel: 'Cancelar',
    removeLoading: 'Quitando',
    removeError: 'No se pudo quitar al entrenador.',
  },
} as const;

export default function CoachesPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  // Inline confirmation dialog for "remove this coach". Holds the
  // coach we're about to remove (or null when closed) and submit
  // state for the network call. Lives at the page level so the
  // dialog markup is rendered once and shared across all rows.
  const [removeTarget, setRemoveTarget] = useState<GymCoachWithUser | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState<string | null>(null);

  async function handleConfirmRemove() {
    if (!removeTarget || removing) return;
    setRemoving(true);
    setRemoveErr(null);
    try {
      const res = await fetch('/api/tribe-os/coaches/remove/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: removeTarget.user_id }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        setRemoveErr(s.removeError);
        setRemoving(false);
        return;
      }
      setRemoving(false);
      setRemoveTarget(null);
      setReloadKey((k) => k + 1);
    } catch {
      setRemoveErr(s.removeError);
      setRemoving(false);
    }
  }

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch('/api/tribe-os/coaches/', { method: 'GET' });
        if (cancelled) return;
        if (res.status === 404) {
          setState({ kind: 'no_gym' });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: RosterResponse;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.error });
          return;
        }
        setState({
          kind: 'ready',
          gym: body.data.gym,
          coaches: body.data.coaches,
          isOwner: body.data.is_owner ?? false,
        });
        trackEvent('tribe_os_coaches_viewed', { coach_count: body.data.coaches.length });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.error });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, reloadKey, s.error]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loading}…
        </p>
      </main>
    );
  }

  return (
    <main className="text-white px-4 py-8 sm:py-10 pb-24">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-tight">{s.title}</h1>
          <p className="text-sm text-white/70 mt-1">{s.subtitle}</p>
        </header>

        {state.kind === 'loading' ? (
          <p className="py-12 text-center text-sm text-white/60">{s.loading}…</p>
        ) : state.kind === 'no_gym' ? (
          <div className="py-12 text-center space-y-3">
            <h2 className="text-lg font-bold">{s.noGymTitle}</h2>
            <p className="text-sm text-white/70 max-w-sm mx-auto leading-relaxed">{s.noGymHint}</p>
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-12 text-center space-y-4">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-white/80">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-tribe-surface text-white text-sm font-semibold rounded-lg hover:bg-tribe-mid transition-colors"
            >
              {s.retry}
            </button>
          </div>
        ) : (
          <>
            <section className="bg-tribe-surface rounded-xl border border-tribe-mid p-4 mb-4">
              <p className="text-xs uppercase tracking-[0.1em] text-white/50 font-semibold mb-1">{s.gymLabel}</p>
              <p className="text-base font-bold text-white truncate">{state.gym.name}</p>
              {/* Slug is technical metadata — useful for support /
                  shared-URL traceability, but de-emphasized until
                  there's an actual shared URL surface that uses it. */}
              <p className="text-[10px] text-white/30 mt-1 font-mono tracking-wide">{state.gym.slug}</p>
            </section>

            {state.coaches.length === 0 || (state.coaches.length === 1 && state.coaches[0].role === 'owner') ? (
              // Solo state. The owner sees a hint that points at
              // the Add-a-coach form below; non-owners see a hint
              // that explains why they can't add.
              <OnlyYouState copy={s} isOwner={state.isOwner} />
            ) : (
              <ul className="space-y-2 mb-4">
                {state.coaches.map((coach) => (
                  <CoachRow
                    key={`${coach.gym_id}:${coach.user_id}`}
                    coach={coach}
                    copy={s}
                    onRemove={state.isOwner ? () => setRemoveTarget(coach) : undefined}
                  />
                ))}
              </ul>
            )}

            {/* Invite form — owner-only. Non-owners see a small
                explanatory note instead so the page doesn't feel
                broken. */}
            {state.isOwner ? (
              <div className="mt-4">
                <InviteCoachForm onInvited={() => setReloadKey((k) => k + 1)} />
              </div>
            ) : (
              <p className="text-xs text-white/40 mt-6 text-center leading-relaxed">{s.inviteSoonNotice}</p>
            )}
          </>
        )}
      </div>

      {/* Remove-coach confirmation dialog. Lives at the page level
          so a single dialog instance is shared across all coach
          rows. Open state is driven by removeTarget — null = closed,
          a coach row = open and targeted. */}
      <Dialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removing) {
            // Clear both the target and any leftover error so the
            // next "open" (a different coach row) starts fresh.
            // Without this, dismissing via overlay-click instead
            // of the Cancel button leaves removeErr stale.
            setRemoveTarget(null);
            setRemoveErr(null);
          }
        }}
      >
        <DialogContent className="max-w-sm rounded-xl p-6 bg-tribe-surface border border-tribe-mid text-white">
          <DialogTitle className="text-lg font-bold text-tribe-red">{s.removeTitle}</DialogTitle>
          <p className="text-sm text-white/80 mt-2 leading-relaxed">
            {removeTarget
              ? s.removeDescription(removeTarget.user?.name ?? removeTarget.user?.email ?? removeTarget.user_id)
              : ''}
          </p>
          {removeErr ? (
            <div
              className="flex items-start gap-2 mt-3 p-3 bg-tribe-red/10 border border-tribe-red/30 rounded-lg text-sm"
              role="alert"
            >
              <AlertCircle className="w-4 h-4 text-tribe-red shrink-0 mt-0.5" />
              <span>{removeErr}</span>
            </div>
          ) : null}
          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={() => {
                setRemoveTarget(null);
                setRemoveErr(null);
              }}
              disabled={removing}
              className="flex-1 px-4 py-2.5 bg-tribe-mid text-white text-sm font-bold rounded-lg hover:bg-tribe-card transition-colors disabled:opacity-60"
            >
              {s.removeCancel}
            </button>
            <button
              type="button"
              onClick={handleConfirmRemove}
              disabled={removing}
              className="flex-1 px-4 py-2.5 bg-tribe-red text-white text-sm font-bold rounded-lg hover:bg-tribe-red/80 transition-colors disabled:opacity-60"
            >
              {removing ? `${s.removeLoading}…` : s.removeConfirm}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* First-visit guide. Independent seen-flag from the other
          Tribe.OS page guides. */}
      <CoachesPageGuide enabled />
    </main>
  );
}

function CoachRow({
  coach,
  copy: s,
  onRemove,
}: {
  coach: GymCoachWithUser;
  copy: typeof copy.en | typeof copy.es;
  /**
   * When provided, render a trash icon on the right that triggers
   * this callback. Caller is expected to pass undefined for the
   * owner's own row (we never let the owner remove themselves) and
   * for non-owner callers (only the gym owner can remove anyone).
   */
  onRemove?: () => void;
}) {
  const initial = (coach.user?.name?.charAt(0) ?? '?').toUpperCase();
  const displayName = coach.user?.name ?? coach.user?.email ?? coach.user_id;
  const roleLabel = coach.role === 'owner' ? s.roleOwner : coach.role === 'assistant' ? s.roleAssistant : s.roleCoach;
  const isOwner = coach.role === 'owner';
  const showRemove = !!onRemove && !isOwner;

  return (
    <li>
      <div
        className={`flex items-center gap-3 p-4 bg-tribe-surface rounded-xl border ${
          isOwner ? 'border-tribe-green/50' : 'border-tribe-mid'
        }`}
      >
        <div
          className={`w-10 h-10 rounded-full ${
            isOwner ? 'bg-tribe-green text-tribe-dark' : 'bg-tribe-mid text-white'
          } flex items-center justify-center text-base font-bold shrink-0`}
        >
          {isOwner ? <Crown className="w-5 h-5" /> : initial}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{displayName}</p>
          {coach.user?.email ? <p className="text-xs text-white/60 mt-0.5 truncate">{coach.user.email}</p> : null}
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border shrink-0 ${
            isOwner
              ? 'bg-tribe-green/20 text-tribe-green border-tribe-green/40'
              : 'bg-tribe-mid text-white/70 border-tribe-mid'
          }`}
        >
          {roleLabel}
        </span>
        {showRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={s.removeAria}
            className="text-white/40 hover:text-tribe-red transition-colors shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function OnlyYouState({ copy: s, isOwner }: { copy: typeof copy.en | typeof copy.es; isOwner: boolean }) {
  // Owner sees the "use Add a coach below" hint; non-owner sees
  // the explanatory variant since they don't have access to the
  // invite form.
  const hint = isOwner ? s.onlyYouHint : s.onlyYouHintNonOwner;
  return (
    <div className="py-12 text-center space-y-3">
      <Users className="w-10 h-10 text-tribe-green mx-auto" />
      <h2 className="text-lg font-bold text-white">{s.onlyYouTitle}</h2>
      <p className="text-sm text-white/70 max-w-sm mx-auto leading-relaxed">{hint}</p>
    </div>
  );
}
