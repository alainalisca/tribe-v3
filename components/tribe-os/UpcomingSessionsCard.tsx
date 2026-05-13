'use client';

/**
 * UpcomingSessionsCard — dashboard widget listing the gym's sessions
 * scheduled for today + tomorrow. Each row shows session name, time
 * window, coach, enrollment progress, and a status badge.
 *
 * Source: GET /api/tribe-os/dashboard/upcoming-sessions (lazy-fetched
 * on mount). Falls back to silent hide on error so the rest of the
 * dashboard still renders.
 *
 * Click-through: each row links to /os/sessions/[id]/attendance for
 * the bulk-attendance flow — that's the most common "I'm done teaching,
 * record who came" intent after looking at upcoming sessions.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface UpcomingSession {
  id: string;
  title: string | null;
  sport: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  coach_name: string | null;
  current_participants: number | null;
  max_participants: number | null;
}

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; sessions: UpcomingSession[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Upcoming Sessions',
    columns: { name: 'Session Name', time: 'Time', coach: 'Coach', enrollment: 'Enrollment', status: 'Status' },
    statusFull: 'FULL',
    statusAvailable: 'AVAILABLE',
    statusOpen: 'OPEN',
    viewAll: 'View All Sessions',
    empty: 'No sessions scheduled for today or tomorrow.',
    error: 'Could not load upcoming sessions.',
    unknownSession: 'Session',
    unknownCoach: '—',
  },
  es: {
    title: 'Próximas sesiones',
    columns: {
      name: 'Nombre de la sesión',
      time: 'Hora',
      coach: 'Coach',
      enrollment: 'Inscripción',
      status: 'Estado',
    },
    statusFull: 'LLENA',
    statusAvailable: 'DISPONIBLE',
    statusOpen: 'ABIERTA',
    viewAll: 'Ver todas las sesiones',
    empty: 'No hay sesiones programadas para hoy ni mañana.',
    error: 'No se pudieron cargar las próximas sesiones.',
    unknownSession: 'Sesión',
    unknownCoach: '—',
  },
} as const;

export default function UpcomingSessionsCard() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tribe-os/dashboard/upcoming-sessions/', { method: 'GET' });
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { sessions?: UpcomingSession[] };
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'ready', sessions: body.data.sessions ?? [] });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-5">
      <header className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base font-bold text-gray-900">{s.title}</h2>
      </header>

      {state.kind === 'loading' ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : state.kind === 'error' ? (
        <p className="text-sm text-gray-500 py-4 text-center">{s.error}</p>
      ) : state.sessions.length === 0 ? (
        <div className="py-8 text-center">
          <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">{s.empty}</p>
        </div>
      ) : (
        <>
          {/* Table header — visible on lg+, hidden on mobile where rows go vertical. */}
          <div className="hidden lg:grid grid-cols-[2fr_1.3fr_1.2fr_1.4fr_0.7fr] gap-3 px-2 pb-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold border-b border-gray-100">
            <span>{s.columns.name}</span>
            <span>{s.columns.time}</span>
            <span>{s.columns.coach}</span>
            <span>{s.columns.enrollment}</span>
            <span className="text-right">{s.columns.status}</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {state.sessions.map((sess) => (
              <SessionRow key={sess.id} session={sess} copy={s} />
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <Link
              href="/os/schedule"
              className="inline-flex items-center gap-1 text-xs font-semibold text-tribe-green hover:text-tribe-green/80"
            >
              {s.viewAll}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function SessionRow({ session, copy: s }: { session: UpcomingSession; copy: typeof copy.en | typeof copy.es }) {
  const name = session.title || session.sport || s.unknownSession;
  const time =
    session.start_time && session.end_time
      ? `${formatTime(session.start_time)} - ${formatTime(session.end_time)}`
      : session.start_time
        ? formatTime(session.start_time)
        : '—';
  const coach = session.coach_name || s.unknownCoach;
  const enrolled = session.current_participants ?? 0;
  const max = session.max_participants ?? 0;
  const enrollmentPct = max > 0 ? Math.min(100, Math.round((enrolled / max) * 100)) : 0;
  const isFull = max > 0 && enrolled >= max;
  const isLow = max > 0 && enrollmentPct < 40;

  return (
    <li className="lg:grid lg:grid-cols-[2fr_1.3fr_1.2fr_1.4fr_0.7fr] lg:gap-3 lg:items-center py-3 px-2">
      <p className="text-sm font-semibold text-gray-900 lg:truncate">{name}</p>
      <p className="text-xs text-gray-500 mt-0.5 lg:mt-0">{time}</p>
      <p className="text-xs text-gray-500 mt-0.5 lg:mt-0 lg:truncate">{coach}</p>
      <div className="mt-2 lg:mt-0 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isFull ? 'bg-tribe-red' : isLow ? 'bg-tribe-amber' : 'bg-tribe-green'}`}
            style={{ width: `${enrollmentPct}%` }}
          />
        </div>
        <span className="text-[11px] text-gray-500 font-medium shrink-0 tabular-nums">
          {enrolled}/{max || '—'}
        </span>
      </div>
      <div className="mt-2 lg:mt-0 lg:text-right">
        <StatusBadge full={isFull} low={isLow} copy={s} />
      </div>
    </li>
  );
}

function StatusBadge({ full, low, copy: s }: { full: boolean; low: boolean; copy: typeof copy.en | typeof copy.es }) {
  if (full) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-tribe-red/10 text-tribe-red border border-tribe-red/20">
        {s.statusFull}
      </span>
    );
  }
  if (low) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-tribe-amber/10 text-tribe-dark border border-tribe-amber/30">
        {s.statusOpen}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-blue-50 text-blue-700 border border-blue-200">
      {s.statusAvailable}
    </span>
  );
}

function formatTime(timeStr: string): string {
  // Accepts "HH:MM:SS" or "HH:MM" — return "h:MM AM/PM"
  const [hh, mm] = timeStr.split(':');
  const h = Number(hh);
  const m = mm ?? '00';
  if (!Number.isFinite(h)) return timeStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${m} ${period}`;
}
