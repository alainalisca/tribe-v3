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
import Link from 'next/link';
import { ArrowLeft, Users, Crown, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import type { GymCoachWithUser } from '@/lib/dal/gymCoaches';

interface RosterResponse {
  gym: { id: string; name: string; slug: string };
  coaches: GymCoachWithUser[];
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'no_gym' }
  | { kind: 'ready'; gym: RosterResponse['gym']; coaches: GymCoachWithUser[] };

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
    onlyYouHint: 'You are the only coach in this gym. The invite flow is coming in a future update.',
    roleOwner: 'Owner',
    roleCoach: 'Coach',
    roleAssistant: 'Assistant',
    gymLabel: 'Gym',
    inviteSoonNotice: 'Inviting additional coaches is coming in a future update.',
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
    onlyYouHint: 'Eres el único entrenador en este gym. La función para invitar llegará en una próxima actualización.',
    roleOwner: 'Propietario',
    roleCoach: 'Entrenador',
    roleAssistant: 'Asistente',
    gymLabel: 'Gym',
    inviteSoonNotice: 'Invitar a más entrenadores llegará en una próxima actualización.',
  },
} as const;

export default function CoachesPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

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
        setState({ kind: 'ready', gym: body.data.gym, coaches: body.data.coaches });
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
      <main className="min-h-screen bg-tribe-dark flex items-center justify-center px-4">
        <p className="text-white/70 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loading}…
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-tribe-dark text-white px-4 pt-8 pb-24">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/os/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {s.backLabel}
        </Link>

        <header className="mb-6">
          <p className="text-tribe-green uppercase tracking-[0.1em] text-xs font-semibold mb-2">Tribe.OS</p>
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
              // Empty / solo case already says "invite flow coming
              // in a future update" in its hint — no need for a
              // second copy of the same message below.
              <OnlyYouState copy={s} />
            ) : (
              <>
                <ul className="space-y-2">
                  {state.coaches.map((coach) => (
                    <CoachRow key={`${coach.gym_id}:${coach.user_id}`} coach={coach} copy={s} />
                  ))}
                </ul>
                <p className="text-xs text-white/40 mt-6 text-center leading-relaxed">{s.inviteSoonNotice}</p>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function CoachRow({ coach, copy: s }: { coach: GymCoachWithUser; copy: typeof copy.en | typeof copy.es }) {
  const initial = (coach.user?.name?.charAt(0) ?? '?').toUpperCase();
  const displayName = coach.user?.name ?? coach.user?.email ?? coach.user_id;
  const roleLabel = coach.role === 'owner' ? s.roleOwner : coach.role === 'assistant' ? s.roleAssistant : s.roleCoach;
  const isOwner = coach.role === 'owner';

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
      </div>
    </li>
  );
}

function OnlyYouState({ copy: s }: { copy: typeof copy.en | typeof copy.es }) {
  return (
    <div className="py-12 text-center space-y-3">
      <Users className="w-10 h-10 text-tribe-green mx-auto" />
      <h2 className="text-lg font-bold text-white">{s.onlyYouTitle}</h2>
      <p className="text-sm text-white/70 max-w-sm mx-auto leading-relaxed">{s.onlyYouHint}</p>
    </div>
  );
}
