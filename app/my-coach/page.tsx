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
import {
  ArrowLeft,
  Calendar,
  Flame,
  Users,
  Trophy,
  AlertCircle,
  Building2,
  Check,
  Hand,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { formatShortDate } from '@/lib/format/currency';
import { trackEvent } from '@/lib/analytics';
import { showError } from '@/lib/toast';
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

interface TodaySession {
  session_id: string;
  title: string | null;
  sport: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  already_checked_in: boolean;
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
  /** Server-resolved (in gym TZ) "did this member train today?". Drives the streak-at-risk banner. */
  trained_today: boolean;
  /** Attended sessions in the rolling last 7 days. Drives the week-over-week card. */
  sessions_last_7d: number;
  /** Attended sessions in the prior 7 days (8–14 ago). Compared against last_7d for delta. */
  sessions_prev_7d: number;
  partners: Partner[];
  recent_attendance: AttendanceRow[];
  today_sessions: TodaySession[];
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
    welcomeTitle: 'Welcome to your training record.',
    welcomeBody:
      'Your coach is tracking your attendance, sessions, and progress. Everything you see here is yours — your data, your view.',
    welcomeDismiss: 'Got it',
    weekCardTitle: 'Last 7 days',
    weekCardSessions: (n: number) => (n === 1 ? '1 session' : `${n} sessions`),
    weekCardDeltaUp: (n: number) => `+${n} vs the week before`,
    weekCardDeltaDown: (n: number) => `${n} less than the week before`,
    weekCardDeltaSame: 'Same as the week before',
    weekCardFirstWeek: 'Your first week tracked here.',
    streakAtRiskTitle: (n: number) => `Your ${n}-day streak is at risk`,
    streakAtRiskHint: 'Show up today to keep it alive. One session is all it takes.',
    streakAtRiskTitleNoSessions: (n: number) => `Your ${n}-day streak is at risk — no sessions on the schedule today`,
    streakAtRiskHintNoSessions: 'Reach out to your coach to fit in a session, or your streak ends tomorrow.',
    streakMilestoneTitle: (n: number) => `${n}-day streak unlocked`,
    streakMilestoneHint7: 'A full week of showing up. The hard part is starting; you already did it.',
    streakMilestoneHint14: 'Two weeks in. This is the part most people quit. Not you.',
    streakMilestoneHint30: 'Thirty days. Whatever you trained for, you can feel the difference now.',
    streakMilestoneHint100: 'One hundred days. You are a different person than you were when you started.',
    todayTitle: "Today's sessions",
    todayHint: 'Tap when you arrive. Your coach sees it instantly.',
    todayEmpty: 'Nothing on the schedule today.',
    checkInCta: "I'm here",
    checkInDone: 'Checked in',
    checkInUndo: 'Undo',
    checkInUndoHint: 'Tap to undo',
    checkInUndoError: "Couldn't undo. Try again.",
    checkInPending: 'Saving…',
    checkInError: "Couldn't save check-in. Try again.",
    checkInRateLimited: "You're checking in too fast. Try again in a minute.",
    sessionFallbackTitle: 'Session',
    sessionDurationMinutes: (n: number) => `${n} min`,
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
    downloadDataLabel: 'Download my training data',
    downloadDataHint:
      'Get a JSON file with everything Tribe.OS has on you across every gym you belong to. Useful if you want a backup or want to take your data somewhere else.',
    downloadDataPending: 'Preparing your download…',
    downloadDataError: "Couldn't prepare your data right now. Try again.",
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
    welcomeTitle: 'Bienvenido a tu registro de entrenamiento.',
    welcomeBody:
      'Tu coach está registrando tu asistencia, sesiones y progreso. Todo lo que ves aquí es tuyo — tus datos, tu vista.',
    welcomeDismiss: 'Entendido',
    weekCardTitle: 'Últimos 7 días',
    weekCardSessions: (n: number) => (n === 1 ? '1 sesión' : `${n} sesiones`),
    weekCardDeltaUp: (n: number) => `+${n} vs. la semana anterior`,
    weekCardDeltaDown: (n: number) => `${n} menos que la semana anterior`,
    weekCardDeltaSame: 'Igual que la semana anterior',
    weekCardFirstWeek: 'Tu primera semana registrada aquí.',
    streakAtRiskTitle: (n: number) => `Tu racha de ${n} días está en riesgo`,
    streakAtRiskHint: 'Preséntate hoy para mantenerla viva. Una sesión basta.',
    streakAtRiskTitleNoSessions: (n: number) => `Tu racha de ${n} días está en riesgo — no hay sesiones hoy`,
    streakAtRiskHintNoSessions: 'Pide a tu coach que abra un espacio, o tu racha termina mañana.',
    streakMilestoneTitle: (n: number) => `Racha de ${n} días desbloqueada`,
    streakMilestoneHint7: 'Una semana entera de presentarte. Lo difícil es empezar; ya lo hiciste.',
    streakMilestoneHint14: 'Dos semanas. Aquí es donde la mayoría abandona. Tú no.',
    streakMilestoneHint30: 'Treinta días. Sea lo que sea que entrenas, ya sientes la diferencia.',
    streakMilestoneHint100: 'Cien días. Eres una persona distinta a la que empezó.',
    todayTitle: 'Sesiones de hoy',
    todayHint: 'Marca cuando llegues. Tu coach lo ve al instante.',
    todayEmpty: 'No hay nada programado para hoy.',
    checkInCta: 'Estoy aquí',
    checkInDone: 'Registrado',
    checkInUndo: 'Deshacer',
    checkInUndoHint: 'Toca para deshacer',
    checkInUndoError: 'No se pudo deshacer. Intenta de nuevo.',
    checkInPending: 'Guardando…',
    checkInError: 'No se pudo registrar tu llegada. Intenta de nuevo.',
    checkInRateLimited: 'Estás marcando demasiado rápido. Intenta de nuevo en un minuto.',
    sessionFallbackTitle: 'Sesión',
    sessionDurationMinutes: (n: number) => `${n} min`,
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
    downloadDataLabel: 'Descargar mis datos de entrenamiento',
    downloadDataHint:
      'Obtén un archivo JSON con todo lo que Tribe.OS tiene sobre ti en cada gym del que eres miembro. Útil para hacer un respaldo o llevarte tus datos a otro lugar.',
    downloadDataPending: 'Preparando tu descarga…',
    downloadDataError: 'No se pudo preparar tu archivo ahora. Intenta de nuevo.',
  },
} as const;

export default function MyCoachPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const router = useRouter();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // First-visit welcome banner. Set when the coach-added-you email
  // CTA arrives with ?welcome=1. We surface a small banner once,
  // clear the URL query param (so a refresh doesn't re-show it),
  // and remember dismissal via localStorage so a different device
  // visit shows it once as well.
  const [showWelcome, setShowWelcome] = useState(false);

  // Welcome banner detection. Runs once on mount: if the page was
  // opened via the coach-added-you email CTA (?welcome=1) AND the
  // user hasn't dismissed it before, show the banner. We strip the
  // query string from the URL so a refresh doesn't re-trigger.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const flag = url.searchParams.get('welcome');
    if (flag !== '1') return;
    url.searchParams.delete('welcome');
    window.history.replaceState({}, '', url.toString());
    const dismissed = window.localStorage.getItem('tribe_os_my_coach_welcome_dismissed');
    if (dismissed === '1') return;
    setShowWelcome(true);
    trackEvent('tribe_member_my_coach_welcome_shown');
  }, []);

  function dismissWelcome() {
    setShowWelcome(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('tribe_os_my_coach_welcome_dismissed', '1');
    }
    trackEvent('tribe_member_my_coach_welcome_dismissed');
  }

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

  // Self check-in for one of today's sessions. Optimistic flip so the
  // button confirms instantly; on failure, revert + toast. The
  // endpoint is idempotent (`created: false` if a row already
  // existed), so worst case the user double-taps and nothing changes.
  async function handleCheckIn(sessionId: string) {
    if (state.kind !== 'ready' || !state.record) return;
    const record = state.record;
    const target = record.today_sessions.find((s) => s.session_id === sessionId);
    if (!target || target.already_checked_in) return;

    // Optimistic update.
    setState({
      ...state,
      record: {
        ...record,
        today_sessions: record.today_sessions.map((s) =>
          s.session_id === sessionId ? { ...s, already_checked_in: true } : s
        ),
      },
    });
    trackEvent('tribe_member_self_check_in_clicked', {
      gym_id: record.gym_id,
      session_id: sessionId,
    });

    try {
      const res = await fetch('/api/me/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: record.client_id, session_id: sessionId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        retry_after_seconds?: number;
      };
      if (!res.ok || !body.success) {
        // Revert optimistic flip.
        setState((prev) => {
          if (prev.kind !== 'ready' || !prev.record) return prev;
          return {
            ...prev,
            record: {
              ...prev.record,
              today_sessions: prev.record.today_sessions.map((s) =>
                s.session_id === sessionId ? { ...s, already_checked_in: false } : s
              ),
            },
          };
        });
        // Distinguish the rate-limit case so the toast tells the
        // member to slow down instead of "couldn't save" (which
        // they'd interpret as a server issue and keep tapping).
        const errorCopy =
          res.status === 429 || body.error === 'rate_limited'
            ? copy[language].checkInRateLimited
            : copy[language].checkInError;
        showError(errorCopy);
        trackEvent('tribe_member_self_check_in_failed', {
          gym_id: record.gym_id,
          session_id: sessionId,
          reason: body.error ?? 'unknown',
          rate_limited: res.status === 429,
        });
        return;
      }
      trackEvent('tribe_member_self_check_in_succeeded', {
        gym_id: record.gym_id,
        session_id: sessionId,
      });
    } catch {
      // Revert optimistic flip.
      setState((prev) => {
        if (prev.kind !== 'ready' || !prev.record) return prev;
        return {
          ...prev,
          record: {
            ...prev.record,
            today_sessions: prev.record.today_sessions.map((s) =>
              s.session_id === sessionId ? { ...s, already_checked_in: false } : s
            ),
          },
        };
      });
      showError(copy[language].checkInError);
      trackEvent('tribe_member_self_check_in_failed', {
        gym_id: record.gym_id,
        session_id: sessionId,
        reason: 'network',
      });
    }
  }

  /**
   * Undo a check-in the member just made (or earlier today). Same
   * optimistic-flip pattern as the check-in path but in reverse:
   * we flip the pill back to "I'm here" immediately, then revert
   * on server failure.
   */
  async function handleUndoCheckIn(sessionId: string) {
    if (state.kind !== 'ready' || !state.record) return;
    const record = state.record;
    const target = record.today_sessions.find((s) => s.session_id === sessionId);
    if (!target || !target.already_checked_in) return;

    setState({
      ...state,
      record: {
        ...record,
        today_sessions: record.today_sessions.map((s) =>
          s.session_id === sessionId ? { ...s, already_checked_in: false } : s
        ),
      },
    });
    trackEvent('tribe_member_self_check_in_undone', {
      gym_id: record.gym_id,
      session_id: sessionId,
    });

    try {
      const res = await fetch('/api/me/check-in', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: record.client_id, session_id: sessionId }),
      });
      const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !body.success) {
        // Revert optimistic flip back to checked-in.
        setState((prev) => {
          if (prev.kind !== 'ready' || !prev.record) return prev;
          return {
            ...prev,
            record: {
              ...prev.record,
              today_sessions: prev.record.today_sessions.map((s) =>
                s.session_id === sessionId ? { ...s, already_checked_in: true } : s
              ),
            },
          };
        });
        showError(copy[language].checkInUndoError);
      }
    } catch {
      setState((prev) => {
        if (prev.kind !== 'ready' || !prev.record) return prev;
        return {
          ...prev,
          record: {
            ...prev.record,
            today_sessions: prev.record.today_sessions.map((s) =>
              s.session_id === sessionId ? { ...s, already_checked_in: true } : s
            ),
          },
        };
      });
      showError(copy[language].checkInUndoError);
    }
  }

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
  return (
    <ReadyView
      state={state}
      copy={s}
      language={language}
      onGymChange={handleGymChange}
      onCheckIn={handleCheckIn}
      onUndoCheckIn={handleUndoCheckIn}
      showWelcome={showWelcome}
      onDismissWelcome={dismissWelcome}
    />
  );
}

function ReadyView({
  state,
  copy: s,
  language,
  onGymChange,
  onCheckIn,
  onUndoCheckIn,
  showWelcome,
  onDismissWelcome,
}: {
  state: Extract<PageState, { kind: 'ready' }>;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
  onGymChange: (clientId: string) => void;
  onCheckIn: (sessionId: string) => void;
  onUndoCheckIn: (sessionId: string) => void;
  showWelcome: boolean;
  onDismissWelcome: () => void;
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

        {/* First-visit welcome banner. Surfaces when the page was
            opened from the coach-added-you email CTA (?welcome=1)
            and the member hasn't dismissed it before. */}
        {showWelcome ? (
          <section className="bg-gradient-to-br from-tribe-green/20 to-tribe-green/5 border border-tribe-green/30 rounded-2xl p-4 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-tribe-green-dark">{s.welcomeTitle}</p>
              <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{s.welcomeBody}</p>
            </div>
            <button
              type="button"
              onClick={onDismissWelcome}
              className="shrink-0 inline-flex items-center px-3 py-1.5 bg-white border border-gray-200 text-xs font-semibold text-gray-700 rounded-full hover:bg-gray-50 transition-colors"
            >
              {s.welcomeDismiss}
            </button>
          </section>
        ) : null}

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
          <RecordBlocks
            record={state.record}
            membership={activeMembership}
            copy={s}
            language={language}
            onCheckIn={onCheckIn}
            onUndoCheckIn={onUndoCheckIn}
          />
        )}

        {/* Privacy / data-rights footer — surfaces the right-to-access
            half of GDPR. The right-to-erasure half is a coach-side
            action (POST /api/tribe-os/clients/[id]/purge); members
            request that by contacting their coach. */}
        <DownloadDataButton copy={s} />

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
  onCheckIn,
  onUndoCheckIn,
}: {
  record: TrainingRecord;
  membership: Membership | undefined;
  copy: typeof copy.en | typeof copy.es;
  language: 'en' | 'es';
  onCheckIn: (sessionId: string) => void;
  onUndoCheckIn: (sessionId: string) => void;
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

      {/* Streak banner — at-risk warning (loss aversion) when the
          member has a meaningful streak going AND hasn't trained
          today, or milestone celebration when they hit 7/14/30/100
          days exactly today. Renders nothing otherwise so the page
          doesn't grow unnecessarily for members not on a streak. */}
      <StreakBanner record={record} copy={s} />

      {/* Today's sessions — self check-in. Hidden entirely when the
          gym owner has nothing scheduled today; we don't want a dead
          empty-state competing with the stats section. */}
      {record.today_sessions.length > 0 ? (
        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Hand className="w-4 h-4 text-tribe-green-dark" />
            <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold">{s.todayTitle}</h2>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{s.todayHint}</p>
          <ul className="space-y-2">
            {record.today_sessions.map((session) => {
              const title = session.title?.trim() || session.sport?.trim() || s.sessionFallbackTitle;
              return (
                <li
                  key={session.session_id}
                  className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
                    <p className="text-xs text-gray-500">
                      {session.start_time ? formatTimeOfDay(session.start_time, language) : '—'}
                      {session.duration_minutes ? ` · ${s.sessionDurationMinutes(session.duration_minutes)}` : ''}
                    </p>
                  </div>
                  {session.already_checked_in ? (
                    // Clickable pill — taps it to undo. Hover state
                    // hints "Undo" so members know it's actionable.
                    // Coach can still see "this was tapped then
                    // undone" via the existing attendance edit flow.
                    <button
                      type="button"
                      onClick={() => onUndoCheckIn(session.session_id)}
                      title={s.checkInUndoHint}
                      className="group inline-flex items-center gap-1 px-3 py-1.5 bg-tribe-green/15 text-tribe-green-dark text-xs font-semibold rounded-full whitespace-nowrap hover:bg-tribe-warning/20 hover:text-tribe-warning transition-colors"
                    >
                      <Check className="w-3.5 h-3.5 group-hover:hidden" />
                      <span className="group-hover:hidden">{s.checkInDone}</span>
                      <span className="hidden group-hover:inline">{s.checkInUndo}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onCheckIn(session.session_id)}
                      className="px-3 py-1.5 bg-tribe-green text-white text-xs font-semibold rounded-full hover:bg-tribe-green-dark transition-colors whitespace-nowrap"
                    >
                      {s.checkInCta}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Week-over-week momentum card. Compares attended sessions
          in the rolling last 7 days vs the prior 7 days. Sits
          above the stats grid because momentum is a dynamic signal
          (changes every session) whereas the stats below are
          mostly static (total / streak). Renders nothing when the
          member has no attendance in either window — first-week
          members see the existing stats grid instead of a card
          full of zeros. */}
      <WeekComparisonCard record={record} copy={s} />

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

/**
 * Streak banner. Shows ONE of two states, or nothing:
 *
 *  - **Milestone celebration** — `trained_today` AND current_streak
 *    exactly equals 7 / 14 / 30 / 100. Means the member crossed
 *    the threshold today; we want a moment of pride before the
 *    badge becomes routine. Persistent chip on the stats card
 *    keeps the achievement visible after the celebration day.
 *
 *  - **At-risk warning** — current_streak >= 3 AND !trained_today.
 *    The threshold is 3 because a 2-day streak isn't meaningfully
 *    a streak (everyone gets two-in-a-row by accident). 3+ is the
 *    floor where loss aversion starts paying off.
 *
 * Why both states live in one component: they're mutually exclusive
 * (you can't have an at-risk streak and a milestone hit on the same
 * day), and the layout uses the same banner slot. Sharing the
 * component keeps the page rendering compact.
 *
 * Why a banner rather than a toast: toasts vanish; the streak status
 * is something the member should be able to look at and act on for
 * the whole session. Persistent visual = reliable nudge.
 */
const STREAK_MILESTONES = new Set([7, 14, 30, 100]);
const STREAK_AT_RISK_THRESHOLD = 3;

function StreakBanner({ record, copy: s }: { record: TrainingRecord; copy: typeof copy.en | typeof copy.es }) {
  const streak = record.current_streak_days;
  const trainedToday = record.trained_today;
  const hasTodaySession = record.today_sessions.length > 0;
  const milestone = trainedToday && STREAK_MILESTONES.has(streak) ? streak : null;
  const atRisk = !trainedToday && streak >= STREAK_AT_RISK_THRESHOLD;

  // Fire a one-shot analytics event when the banner becomes visible.
  // The deps array intentionally captures the banner *state* rather
  // than the underlying values, so we don't re-fire on every
  // re-render when nothing changed.
  useEffect(() => {
    if (milestone) {
      trackEvent('tribe_member_streak_milestone_shown', { streak_days: milestone });
    } else if (atRisk) {
      trackEvent('tribe_member_streak_at_risk_shown', {
        streak_days: streak,
        has_today_session: hasTodaySession,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [milestone, atRisk]);

  if (milestone) {
    const hintMap = {
      7: s.streakMilestoneHint7,
      14: s.streakMilestoneHint14,
      30: s.streakMilestoneHint30,
      100: s.streakMilestoneHint100,
    } as const;
    return (
      <section className="bg-gradient-to-br from-tribe-green/25 to-tribe-green/10 border border-tribe-green/40 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-tribe-green/30 text-tribe-green-dark flex items-center justify-center shrink-0">
          <Flame className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-tribe-green-dark">{s.streakMilestoneTitle(milestone)}</p>
          <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{hintMap[milestone as 7 | 14 | 30 | 100]}</p>
        </div>
      </section>
    );
  }

  if (atRisk) {
    // Two variants of the at-risk banner: the "you have sessions
    // today" version is upbeat ("just show up"), the "no sessions
    // today" version routes the member to their coach. We never
    // tell members to "skip the queue" — only the coach can add
    // a session, so the message respects that boundary.
    const title = hasTodaySession ? s.streakAtRiskTitle(streak) : s.streakAtRiskTitleNoSessions(streak);
    const hint = hasTodaySession ? s.streakAtRiskHint : s.streakAtRiskHintNoSessions;
    return (
      <section className="bg-tribe-warning/10 border border-tribe-warning/40 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-tribe-warning/20 text-tribe-warning flex items-center justify-center shrink-0">
          <Flame className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-tribe-dark">{title}</p>
          <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{hint}</p>
        </div>
      </section>
    );
  }

  return null;
}

/**
 * Last-7-days vs prior-7-days momentum card.
 *
 * Hidden entirely when both windows are zero — first-week members
 * see the standard stats grid below instead of a card full of
 * zeros. Once they have at least one session in either window the
 * card surfaces to give them something visible to track.
 *
 * The delta line picks one of four states:
 *   - up    (last_7d > prev_7d)       green TrendingUp + "+N vs the week before"
 *   - down  (last_7d < prev_7d)       muted TrendingDown + "N less than the week before"
 *   - same  (both > 0, equal)         muted Minus + "Same as the week before"
 *   - first (prev_7d === 0)           neutral + "Your first week tracked here"
 *
 * Why no big arrows or percentage figures: the audience is members,
 * not analysts. "3 sessions this week, +1 vs the week before" reads
 * directly; "+33%" makes them stop and think. We optimize for the
 * read-and-feel pace, not the read-and-analyze pace.
 */
function WeekComparisonCard({ record, copy: s }: { record: TrainingRecord; copy: typeof copy.en | typeof copy.es }) {
  const last = record.sessions_last_7d;
  const prev = record.sessions_prev_7d;
  // Hide on totally fresh accounts — the stats grid below covers the
  // "total: 0" case adequately.
  if (last === 0 && prev === 0) return null;

  const delta = last - prev;
  // Pick the delta visual + copy.
  let deltaIcon: React.ReactNode;
  let deltaText: string;
  let deltaClass: string;
  if (prev === 0 && last > 0) {
    deltaIcon = <TrendingUp className="w-3.5 h-3.5" />;
    deltaText = s.weekCardFirstWeek;
    deltaClass = 'text-tribe-green-dark';
  } else if (delta > 0) {
    deltaIcon = <TrendingUp className="w-3.5 h-3.5" />;
    deltaText = s.weekCardDeltaUp(delta);
    deltaClass = 'text-tribe-green-dark';
  } else if (delta < 0) {
    deltaIcon = <TrendingDown className="w-3.5 h-3.5" />;
    // delta is negative; the copy slot expects a signed integer
    deltaText = s.weekCardDeltaDown(delta);
    deltaClass = 'text-gray-600';
  } else {
    deltaIcon = <Minus className="w-3.5 h-3.5" />;
    deltaText = s.weekCardDeltaSame;
    deltaClass = 'text-gray-600';
  }

  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-[0.08em] text-gray-500 font-semibold">{s.weekCardTitle}</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{s.weekCardSessions(last)}</p>
      </div>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${deltaClass} text-right`}>
        {deltaIcon}
        <span>{deltaText}</span>
      </div>
    </section>
  );
}

/**
 * Format a "HH:MM:SS" or "HH:MM" Postgres `time` value for display.
 * Mirrors the helper in /os/schedule so the member-side time format
 * matches what the coach sees on the coach surface.
 *
 * Spanish keeps the 12-hour AM/PM convention because gym time-of-day
 * is almost always quoted that way colloquially (e.g. "9 AM clase",
 * "6 PM clase") even when written times go 24-hour. Revisit if a
 * Spanish-speaking partner pushes back.
 */
function formatTimeOfDay(timeStr: string, _language: 'en' | 'es'): string {
  const [hh, mm] = timeStr.split(':');
  const h = Number(hh);
  if (!Number.isFinite(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${mm ?? '00'} ${period}`;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * "Download my training data" button. Triggers the server endpoint
 * via a fetch + blob save so we surface a loading state during the
 * round trip (a plain anchor with the URL would just hang the UI
 * for users on slow connections without any feedback).
 *
 * The endpoint sets Content-Disposition: attachment so the browser
 * downloads rather than navigates. We use the same disposition path
 * client-side by creating an object URL and clicking it through a
 * hidden anchor — works on iOS Safari (which sometimes routes
 * direct-link downloads to the share sheet).
 */
function DownloadDataButton({ copy: s }: { copy: typeof copy.en | typeof copy.es }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    trackEvent('tribe_member_data_export_clicked');
    try {
      const res = await fetch('/api/me/training/export', { method: 'GET' });
      if (!res.ok) {
        setError(s.downloadDataError);
        setPending(false);
        trackEvent('tribe_member_data_export_failed', { status: res.status });
        return;
      }
      const blob = await res.blob();
      // Pull the filename from Content-Disposition if present; fall
      // back to a sensible default if a CDN strips the header.
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `tribe-training-data-${new Date().toISOString().slice(0, 10)}.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setPending(false);
      trackEvent('tribe_member_data_export_succeeded');
    } catch {
      setError(s.downloadDataError);
      setPending(false);
      trackEvent('tribe_member_data_export_failed', { status: 0 });
    }
  }

  return (
    <div className="pt-4 border-t border-gray-100">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-start gap-2 group text-left disabled:opacity-60"
      >
        <Download className="w-4 h-4 text-tribe-green-dark mt-0.5 shrink-0" />
        <span>
          <span className="block text-sm font-semibold text-gray-900 group-hover:text-tribe-dark">
            {pending ? s.downloadDataPending : s.downloadDataLabel}
          </span>
          <span className="block text-xs text-gray-500 mt-0.5">{s.downloadDataHint}</span>
        </span>
      </button>
      {error ? (
        <p className="mt-2 text-xs text-tribe-red flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
