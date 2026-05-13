'use client';

/**
 * /my-coach — member-facing training dashboard.
 *
 * Lets a signed-in Tribe user see their own training data as recorded
 * by their gym(s). Sister surface to /os/* — that's the coach view
 * of all members; this is the member view of their own record.
 *
 * Identity match is by email. The API double-checks the
 * authenticated user's email against clients.email before returning
 * any data, so even if someone guesses a client_id they can't see
 * anyone else's record.
 *
 * Page states:
 *   - loading: spinner during initial fetch
 *   - redirecting: not signed in, bouncing to /auth
 *   - no_records: signed in but no matching client rows (member
 *     hasn't been added by any coach yet, or their email differs
 *     from what the coach typed)
 *   - ready: showing the training record for the active membership
 *
 * Multi-gym handling: when the user belongs to >1 gym, a small
 * selector lets them switch. The first (most-recently-active) gym
 * loads by default.
 *
 * What we deliberately DON'T show: AI health_status, churn_risk_score,
 * coach-side notes, AI insight cards. Those are coach-side internals;
 * surfacing a "you're AT_RISK" badge to a member would be alarming
 * and counter to the trust contract.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Flame, Users, Trophy, AlertCircle, Building2 } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { formatShortDate } from '@/lib/format/currency';
import { trackEvent } from '@/lib/analytics';
import StreakMilestoneChip from '@/components/tribe-os/StreakMilestoneChip';
import PwaInstallPrompt from '@/components/tribe-os/PwaInstallPrompt';

interface Membership {
  client_id: string;
  gym_id: string;
  gym_name: string;
  gym_slug: string;
  name: string;
  status: 'active' | 'inactive' | 'lead' | 'lapsed' | null;
  last_seen_at: string | null;
}

interface Partner {
  partner_id: string;
  partner_name: string;
  shared_sessions: number;
  last_shared_at: string;
}

interface AttendanceRow {
  id: string;
  attended_at: string | null;
  created_at: string;
  attended: boolean;
  session_title: string | null;
  session_sport: string | null;
  session_date: string | null;
  session_start_time: string | null;
}

interface TrainingRecord {
  client_id: string;
  member_name: string;
  gym_id: string;
  gym_name: string;
  gym_slug: string;
  total_sessions: number;
  sessions_last_30_days: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_seen_at: string | null;
  partners: Partner[];
  recent_attendance: AttendanceRow[];
}

type PageState =
  | { kind: 'loading' }
  | { kind: 'redirecting' }
  | { kind: 'error'; message: string }
  | { kind: 'no_records' }
  | {
      kind: 'ready';
      memberships: Membership[];
      activeClientId: string;
      record: TrainingRecord | null;
      loadingRecord: boolean;
    };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    pageTitle: 'My training',
    subtitle: 'Your sessions, partners, and progress at the gym.',
    backToHome: 'Back to home',
    loadingLabel: 'Loading',
    redirectingLabel: 'Redirecting',
    errorTitle: 'Could not load your training record.',
    errorRetry: 'Retry',
    noRecordsTitle: "You're not on any gym's roster yet",
    noRecordsHint:
      'Once a coach adds you with the email you signed in with, your training data will show up here automatically. Ask your coach to use the email shown below.',
    yourEmail: 'Your email',
    gymPickerLabel: 'Gym',
    statsTitle: 'Your stats',
    totalSessions: 'Total sessions',
    sessionsLast30: 'Last 30 days',
    currentStreak: 'Current streak',
    longestStreak: 'Longest streak',
    streakDays: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    streakNone: '—',
    partnersTitle: 'You train often with',
    partnersHint: 'Members you’ve shown up alongside the most.',
    partnersEmpty: 'No training partners yet. Show up to a session and you’ll find each other.',
    sharedSessionsLabel: (n: number) => (n === 1 ? '1 session together' : `${n} sessions together`),
    lastTogether: (date: string) => `Last together ${date}`,
    historyTitle: 'Recent attendance',
    historyEmpty: 'No attendance recorded yet. Your coach logs sessions as they happen.',
    attended: 'Attended',
    noShow: 'No show',
    unknownSession: 'Session',
    poweredBy: 'Powered by Tribe.OS',
  },
  es: {
    pageTitle: 'Mi entrenamiento',
    subtitle: 'Tus sesiones, compañeros y progreso en el gimnasio.',
    backToHome: 'Volver al inicio',
    loadingLabel: 'Cargando',
    redirectingLabel: 'Redirigiendo',
    errorTitle: 'No se pudo cargar tu registro de entrenamiento.',
    errorRetry: 'Reintentar',
    noRecordsTitle: 'Aún no estás en la lista de ningún gimnasio',
    noRecordsHint:
      'Cuando un coach te agregue con el correo con el que iniciaste sesión, tus datos aparecerán aquí automáticamente. Pídele a tu coach que use el correo que ves abajo.',
    yourEmail: 'Tu correo',
    gymPickerLabel: 'Gimnasio',
    statsTitle: 'Tus estadísticas',
    totalSessions: 'Sesiones totales',
    sessionsLast30: 'Últimos 30 días',
    currentStreak: 'Racha actual',
    longestStreak: 'Mejor racha',
    streakDays: (n: number) => (n === 1 ? '1 día' : `${n} días`),
    streakNone: '—',
    partnersTitle: 'Entrenas con',
    partnersHint: 'Miembros con los que más has coincidido.',
    partnersEmpty: 'Aún sin compañeros. Asiste a una sesión y se encontrarán.',
    sharedSessionsLabel: (n: number) => (n === 1 ? '1 sesión juntos' : `${n} sesiones juntos`),
    lastTogether: (date: string) => `Última vez ${date}`,
    historyTitle: 'Asistencia reciente',
    historyEmpty: 'Aún sin asistencias registradas. Tu coach registra las sesiones a medida que ocurren.',
    attended: 'Asistió',
    noShow: 'No vino',
    unknownSession: 'Sesión',
    poweredBy: 'Powered by Tribe.OS',
  },
} as const;

export default function MyCoachPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Initial load: confirm auth, fetch memberships, pre-load the
  // first record. Re-runs when reloadKey bumps (retry after error).
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setState({ kind: 'redirecting' });
          router.replace('/auth?returnTo=/my-coach');
        }
        return;
      }
      if (!cancelled) setUserEmail(user.email ?? null);

      try {
        const res = await fetch('/api/me/training', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { memberships?: Membership[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.errorTitle });
          return;
        }
        const memberships = body.data.memberships ?? [];
        if (memberships.length === 0) {
          setState({ kind: 'no_records' });
          trackEvent('tribe_os_my_coach_no_records');
          return;
        }
        // Default to the most-recently-active membership (already
        // sorted in the DAL).
        const activeClientId = memberships[0].client_id;
        setState({
          kind: 'ready',
          memberships,
          activeClientId,
          record: null,
          loadingRecord: true,
        });
        trackEvent('tribe_os_my_coach_viewed', { gym_count: memberships.length });
        await loadRecord(activeClientId, memberships, cancelled);
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    async function loadRecord(clientId: string, memberships: Membership[], wasCancelled: boolean) {
      const res = await fetch(`/api/me/training?client_id=${clientId}`, { method: 'GET' });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { record: TrainingRecord | null };
        error?: string;
      };
      if (wasCancelled) return;
      if (!res.ok || !body.success || !body.data) {
        setState({ kind: 'error', message: body.error || s.errorTitle });
        return;
      }
      setState({
        kind: 'ready',
        memberships,
        activeClientId: clientId,
        record: body.data.record,
        loadingRecord: false,
      });
    }

    return () => {
      cancelled = true;
    };
    // s.errorTitle dep is intentional — refetches on language flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, s.errorTitle]);

  // Switch active membership without a full reload.
  async function handleGymChange(clientId: string) {
    if (state.kind !== 'ready' || state.activeClientId === clientId) return;
    setState({ ...state, activeClientId: clientId, record: null, loadingRecord: true });
    try {
      const res = await fetch(`/api/me/training?client_id=${clientId}`, { method: 'GET' });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { record: TrainingRecord | null };
      };
      if (!res.ok || !body.success || !body.data) {
        setState({ kind: 'error', message: s.errorTitle });
        return;
      }
      setState((prev) =>
        prev.kind === 'ready'
          ? { ...prev, activeClientId: clientId, record: body.data!.record, loadingRecord: false }
          : prev
      );
      trackEvent('tribe_os_my_coach_gym_switched');
    } catch {
      setState({ kind: 'error', message: s.errorTitle });
    }
  }

  if (state.kind === 'loading' || state.kind === 'redirecting') {
    return (
      <main className="flex items-center justify-center px-4 py-24 min-h-screen">
        <p className="text-gray-500 text-sm uppercase tracking-[0.1em]">
          {state.kind === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  if (state.kind === 'error') {
    return (
      <main className="px-4 py-12 min-h-screen">
        <div className="max-w-md mx-auto text-center space-y-4">
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
      </main>
    );
  }

  if (state.kind === 'no_records') {
    return (
      <main className="px-4 py-12 min-h-screen">
        <div className="max-w-md mx-auto space-y-6">
          <Link href="/" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-3.5 h-3.5" />
            {s.backToHome}
          </Link>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-tribe-green/15 text-tribe-green-dark flex items-center justify-center">
              <Building2 className="w-6 h-6" />
            </div>
            <h1 className="text-lg font-bold text-gray-900">{s.noRecordsTitle}</h1>
            <p className="text-sm text-gray-600 leading-relaxed">{s.noRecordsHint}</p>
            {userEmail ? (
              <div className="pt-2">
                <p className="text-xs uppercase tracking-[0.08em] text-gray-500 mb-1">{s.yourEmail}</p>
                <p className="text-sm font-mono text-gray-900 bg-gray-50 rounded-lg px-3 py-2 break-all">{userEmail}</p>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    );
  }

  // state.kind === 'ready'
  return <ReadyView state={state} copy={s} language={language} onGymChange={handleGymChange} />;
}

function ReadyView({
  state,
  copy: s,
  language,
  onGymChange,
}: {
  state: Extract<PageState, { kind: 'ready' }>;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
  onGymChange: (clientId: string) => void;
}) {
  const activeMembership = useMemo(
    () => state.memberships.find((m) => m.client_id === state.activeClientId),
    [state.memberships, state.activeClientId]
  );

  return (
    <main className="px-4 py-6 sm:py-10 min-h-screen pb-24">
      <div className="max-w-3xl mx-auto space-y-5">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-3.5 h-3.5" />
          {s.backToHome}
        </Link>

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-gray-900">{s.pageTitle}</h1>
          <p className="text-sm text-gray-500">{s.subtitle}</p>
        </header>

        {/* Gym selector — only renders when the user belongs to 2+ gyms.
            Single-gym members see just the gym name in the next section. */}
        {state.memberships.length > 1 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-3">
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 mb-1.5">
                {s.gymPickerLabel}
              </span>
              <select
                value={state.activeClientId}
                onChange={(e) => onGymChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-tribe-green focus:ring-2 focus:ring-tribe-green/20"
              >
                {state.memberships.map((m) => (
                  <option key={m.client_id} value={m.client_id}>
                    {m.gym_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {state.loadingRecord || !state.record ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            <div className="h-32 bg-gray-100 rounded-xl animate-pulse" />
          </div>
        ) : (
          <RecordBlocks record={state.record} membership={activeMembership} copy={s} language={language} />
        )}

        {/* Subtle "powered by" footer — reinforces brand without
            interfering with the member-first feel of the page. */}
        <p className="text-xs text-gray-400 text-center pt-6">{s.poweredBy}</p>
      </div>

      {/* PWA install nudge — self-hides for already-installed users,
          users in the native app, and users who dismissed within
          the last 30 days. Highest-leverage retention lever for a
          member surface. */}
      <PwaInstallPrompt />
    </main>
  );
}

function RecordBlocks({
  record,
  membership,
  copy: s,
  language,
}: {
  record: TrainingRecord;
  membership: Membership | undefined;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
}) {
  return (
    <>
      {/* Hero: gym name + member name */}
      <section className="bg-gradient-to-br from-tribe-green/20 to-tribe-green/5 border border-tribe-green/30 rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.1em] text-tribe-green-dark font-semibold mb-1">
          {membership?.gym_name ?? record.gym_name}
        </p>
        <p className="text-xl font-bold text-gray-900">{record.member_name}</p>
      </section>

      {/* Stats grid */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.statsTitle}</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
            label={s.totalSessions}
            value={String(record.total_sessions)}
          />
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
            label={s.sessionsLast30}
            value={String(record.sessions_last_30_days)}
          />
          <StatCard
            icon={<Flame className="w-4 h-4" />}
            label={s.currentStreak}
            value={record.current_streak_days > 0 ? s.streakDays(record.current_streak_days) : s.streakNone}
            badge={<StreakMilestoneChip currentStreakDays={record.current_streak_days} />}
          />
          <StatCard
            icon={<Trophy className="w-4 h-4" />}
            label={s.longestStreak}
            value={record.longest_streak_days > 0 ? s.streakDays(record.longest_streak_days) : s.streakNone}
          />
        </div>
      </section>

      {/* Training partners */}
      <section className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-4 h-4 text-tribe-green-dark" />
          <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold">{s.partnersTitle}</h2>
        </div>
        {record.partners.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">{s.partnersEmpty}</p>
        ) : (
          <>
            <p className="text-xs text-gray-500 leading-relaxed mb-3">{s.partnersHint}</p>
            <ul className="space-y-2">
              {record.partners.map((p) => (
                <li key={p.partner_id} className="flex items-center gap-3 px-2 py-2 -mx-2 rounded-lg">
                  <span className="w-9 h-9 rounded-full bg-tribe-green/15 text-tribe-green-dark text-xs font-bold flex items-center justify-center shrink-0">
                    {initialsFromName(p.partner_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{p.partner_name || '—'}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {s.sharedSessionsLabel(p.shared_sessions)}
                      {' · '}
                      {s.lastTogether(formatShortDate(p.last_shared_at, language))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Recent attendance */}
      <section>
        <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.historyTitle}</h2>
        {record.recent_attendance.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4">{s.historyEmpty}</p>
        ) : (
          <ul className="space-y-2">
            {record.recent_attendance.map((a) => {
              const title = a.session_title?.trim() || a.session_sport?.trim() || s.unknownSession;
              const whenIso = a.attended_at ?? a.session_date ?? a.created_at;
              const dot = a.attended ? 'bg-tribe-green' : 'bg-gray-400';
              const verbLabel = a.attended ? s.attended : s.noShow;
              return (
                <li key={a.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
                  <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
                    <p className="text-xs text-gray-500">
                      {formatShortDate(whenIso, language)} · {verbLabel}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  // Optional inline badge — used for streak milestone chips on the
  // current-streak stat. Renders to the right of the value.
  badge?: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-1.5 text-gray-500 mb-2">
        <span aria-hidden="true">{icon}</span>
        <p className="text-xs uppercase tracking-[0.08em] font-semibold">{label}</p>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {badge}
      </div>
    </div>
  );
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
