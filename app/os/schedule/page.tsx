'use client';

/**
 * /os/schedule — weekly schedule view (matches mockup 4).
 *
 * Renders the caller's sessions for the selected week, grouped by
 * day, with time, name, coach, and enrollment progress per card.
 * The mockup also shows a List / Calendar toggle; we ship the List
 * variant first since it covers the dominant use-case (review what's
 * scheduled, tap into the bulk-attendance flow).
 *
 * Data source: GET /api/tribe-os/schedule?from=&to=
 * Empty days render the day header with a quiet placeholder so the
 * week reads as a real grid rather than collapsing.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, ChevronLeft, ChevronRight, Calendar, List, AlertCircle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { Avatar, Badge } from '@/components/tribe-os/ui';

interface ScheduleSession {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  status: string | null;
  coach_name: string | null;
  current_participants: number | null;
  max_participants: number | null;
}

type WeekState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; from: string; to: string; sessions: ScheduleSession[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    redirectingLabel: 'Redirecting',
    loadingLabel: 'Loading',
    pageTitle: 'Schedule',
    subtitle: "Manage your gym's weekly sessions and keep members engaged.",
    createSession: 'Create Session',
    viewList: 'List',
    viewCalendar: 'Calendar',
    weekOf: 'Week of',
    thisWeek: 'This Week',
    prev: 'Previous week',
    next: 'Next week',
    emptyDay: 'No sessions scheduled.',
    spots: 'spots',
    errorTitle: 'Could not load this week.',
    retry: 'Retry',
    coach: 'Coach',
    status: {
      scheduled: 'Scheduled',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
    },
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    monthsShort: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  es: {
    redirectingLabel: 'Redirigiendo',
    loadingLabel: 'Cargando',
    pageTitle: 'Horario',
    subtitle: 'Gestiona las sesiones semanales de tu gym y mantén a tus miembros activos.',
    createSession: 'Crear sesión',
    viewList: 'Lista',
    viewCalendar: 'Calendario',
    weekOf: 'Semana del',
    thisWeek: 'Esta semana',
    prev: 'Semana anterior',
    next: 'Semana siguiente',
    emptyDay: 'Sin sesiones programadas.',
    spots: 'cupos',
    errorTitle: 'No se pudo cargar la semana.',
    retry: 'Reintentar',
    coach: 'Coach',
    status: {
      scheduled: 'Programada',
      in_progress: 'En progreso',
      completed: 'Completada',
      cancelled: 'Cancelada',
    },
    days: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'],
    monthsShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  },
} as const;

/** Mon-of-this-week as a Date (UTC). */
function weekStart(d: Date): Date {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
}

function shiftWeek(d: Date, weeks: number): Date {
  return new Date(d.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '—';
  const [hh, mm] = timeStr.split(':');
  const h = Number(hh);
  if (!Number.isFinite(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${mm ?? '00'} ${period}`;
}

export default function SchedulePage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  // Anchor = Mon of the displayed week. Bump by ±7 days for navigation.
  const [anchor, setAnchor] = useState<Date>(() => weekStart(new Date()));
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [state, setState] = useState<WeekState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(anchor.getTime() + i * 24 * 60 * 60 * 1000);
      return { date: d, ymd: ymd(d) };
    });
  }, [anchor]);

  useEffect(() => {
    if (gate.state !== 'allowed') return;
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const from = ymd(anchor);
        const to = ymd(new Date(anchor.getTime() + 6 * 24 * 60 * 60 * 1000));
        const res = await fetch(`/api/tribe-os/schedule/?from=${from}&to=${to}`);
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { from: string; to: string; sessions: ScheduleSession[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error', message: body.error || s.errorTitle });
          return;
        }
        setState({ kind: 'ready', from: body.data.from, to: body.data.to, sessions: body.data.sessions });
        trackEvent('tribe_os_schedule_viewed', { session_count: body.data.sessions.length, from });
      } catch {
        if (!cancelled) setState({ kind: 'error', message: s.errorTitle });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [gate.state, anchor, reloadKey, s.errorTitle]);

  // Group sessions by date for fast rendering.
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleSession[]>();
    if (state.kind === 'ready') {
      for (const sess of state.sessions) {
        const arr = map.get(sess.date) ?? [];
        arr.push(sess);
        map.set(sess.date, arr);
      }
    }
    return map;
  }, [state]);

  const isCurrentWeek = useMemo(() => ymd(weekStart(new Date())) === ymd(anchor), [anchor]);

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirectingLabel : s.loadingLabel}…
        </p>
      </main>
    );
  }

  const weekStartDate = anchor;
  const weekEndDate = new Date(anchor.getTime() + 6 * 24 * 60 * 60 * 1000);
  const weekLabel = `${s.monthsShort[weekStartDate.getUTCMonth()]} ${weekStartDate.getUTCDate()}, ${weekStartDate.getUTCFullYear()} – ${s.monthsShort[weekEndDate.getUTCMonth()]} ${weekEndDate.getUTCDate()}, ${weekEndDate.getUTCFullYear()}`;

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <header>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
          <p className="text-sm text-tribe-dark-80 mt-1">{s.subtitle}</p>
        </header>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-4 py-2 bg-tribe-green text-tribe-dark text-sm font-bold rounded-tribe hover:shadow-[0_4px_20px_rgba(132,204,22,0.25)] hover:-translate-y-0.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            {s.createSession}
          </Link>

          <div className="flex items-center gap-1 bg-white border border-tribe-dark-40 rounded-tribe p-1">
            <ViewToggleButton active={view === 'list'} onClick={() => setView('list')} Icon={List} label={s.viewList} />
            <ViewToggleButton
              active={view === 'calendar'}
              onClick={() => setView('calendar')}
              Icon={Calendar}
              label={s.viewCalendar}
            />
          </div>
        </div>

        {/* Week navigator */}
        <div className="bg-white rounded-tribe border border-tribe-dark-40 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setAnchor(shiftWeek(anchor, -1))}
              aria-label={s.prev}
              className="w-8 h-8 inline-flex items-center justify-center text-tribe-dark-80 hover:text-tribe-dark hover:bg-tribe-dark-40 rounded-tribe transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <p className="text-sm font-bold text-tribe-dark">
                {s.weekOf} {s.monthsShort[weekStartDate.getUTCMonth()]} {weekStartDate.getUTCDate()},{' '}
                {weekStartDate.getUTCFullYear()}
              </p>
              <p className="text-[11px] text-tribe-dark-80">{weekLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setAnchor(shiftWeek(anchor, 1))}
              aria-label={s.next}
              className="w-8 h-8 inline-flex items-center justify-center text-tribe-dark-80 hover:text-tribe-dark hover:bg-tribe-dark-40 rounded-tribe transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setAnchor(weekStart(new Date()))}
            disabled={isCurrentWeek}
            className="px-3 py-1.5 text-xs font-semibold rounded-tribe border border-tribe-dark-40 hover:bg-tribe-dark-40 disabled:opacity-60 disabled:cursor-default"
          >
            {s.thisWeek}
          </button>
        </div>

        {/* Body */}
        {state.kind === 'loading' ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-white rounded-tribe border border-tribe-dark-40 animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'error' ? (
          <div className="py-12 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-tribe-red mx-auto" />
            <p className="text-sm text-tribe-dark">{state.message}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="px-4 py-2 bg-tribe-dark-40 text-tribe-dark text-sm font-semibold rounded-tribe hover:bg-tribe-dark-60"
            >
              {s.retry}
            </button>
          </div>
        ) : (
          <DaysList weekDays={weekDays} byDate={byDate} copy={s} />
        )}
      </div>
    </div>
  );
}

function ViewToggleButton({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Calendar;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-tribe transition-colors ${
        active ? 'bg-tribe-dark-40 text-tribe-dark' : 'text-tribe-dark-80 hover:text-tribe-dark'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function DaysList({
  weekDays,
  byDate,
  copy: s,
}: {
  weekDays: Array<{ date: Date; ymd: string }>;
  byDate: Map<string, ScheduleSession[]>;
  copy: typeof copy.en | typeof copy.es;
}) {
  return (
    <div className="space-y-6">
      {weekDays.map(({ date, ymd: ymdStr }) => {
        const sessions = byDate.get(ymdStr) ?? [];
        const dayName = s.days[(date.getUTCDay() + 6) % 7]; // map 0..6 (Sun-Sat) → 6,0,1,2,3,4,5 (Sun last)
        const monthLabel = s.monthsShort[date.getUTCMonth()];
        return (
          <section key={ymdStr}>
            <h2 className="text-base font-bold text-tribe-dark mb-3">
              {dayName}, {monthLabel} {date.getUTCDate()}
            </h2>
            {sessions.length === 0 ? (
              <div className="bg-white rounded-tribe border border-dashed border-tribe-dark-40 px-5 py-6 text-center">
                <p className="text-xs text-tribe-dark-60">{s.emptyDay}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {sessions.map((sess) => (
                  <SessionCard key={sess.id} session={sess} copy={s} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SessionCard({ session, copy: s }: { session: ScheduleSession; copy: typeof copy.en | typeof copy.es }) {
  const name = session.title || session.sport || 'Session';
  const coach = session.coach_name || '—';
  const enrolled = session.current_participants ?? 0;
  const max = session.max_participants ?? 0;
  const pct = max > 0 ? Math.min(100, Math.round((enrolled / max) * 100)) : 0;
  const timeRange =
    session.start_time && session.end_time
      ? `${formatTime(session.start_time)} - ${formatTime(session.end_time)}`
      : formatTime(session.start_time);
  const statusLabel =
    session.status && session.status in s.status ? s.status[session.status as keyof typeof s.status] : null;

  // Map session status → Badge variant (matches the canonical
  // tribe-os session-card semantics).
  let badgeVariant: 'info' | 'success' | 'default' | 'danger' = 'info';
  if (session.status === 'in_progress') badgeVariant = 'success';
  else if (session.status === 'completed') badgeVariant = 'default';
  else if (session.status === 'cancelled') badgeVariant = 'danger';

  const coachInitial = (session.coach_name?.charAt(0) || '?').toUpperCase();

  return (
    <Link
      href={`/os/sessions/${session.id}/attendance`}
      className="bg-white rounded-tribe shadow-tribe p-4 transition-all hover:shadow-tribe-lg hover:scale-[1.01] border border-tribe-dark-40 hover:border-tribe-green block"
    >
      {/* Header: time + status badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-sm font-semibold text-tribe-dark">{timeRange}</span>
        {statusLabel ? <Badge variant={badgeVariant}>{statusLabel}</Badge> : null}
      </div>

      {/* Session name */}
      <h3 className="text-base font-semibold text-tribe-dark mb-2 truncate">{name}</h3>

      {/* Coach */}
      <div className="flex items-center gap-2 mb-4">
        <Avatar initials={coachInitial} size="sm" />
        <span className="text-sm text-tribe-dark-80 truncate">
          {s.coach} {coach}
        </span>
      </div>

      {/* Enrollment */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-tribe-dark-80">Enrollment</span>
          <span className="text-xs font-semibold text-tribe-dark tabular-nums">
            {enrolled}/{max || '—'} {s.spots}
          </span>
        </div>
        <div className="h-2 bg-tribe-dark-40 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${pct >= 100 ? 'bg-tribe-danger' : 'bg-tribe-green'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
