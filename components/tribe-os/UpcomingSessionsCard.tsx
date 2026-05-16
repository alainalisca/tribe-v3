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
import { Calendar, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/tribe-os/ui';

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{s.title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {state.kind === 'loading' ? (
          <div className="px-6 py-4 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 bg-tribe-dark-40 rounded-tribe animate-pulse" />
            ))}
          </div>
        ) : state.kind === 'error' ? (
          <p className="text-sm text-tribe-dark-80 py-6 px-6 text-center">{s.error}</p>
        ) : state.sessions.length === 0 ? (
          <div className="py-8 px-6 text-center">
            <Calendar className="w-8 h-8 text-tribe-dark-60 mx-auto mb-2" />
            <p className="text-sm text-tribe-dark-80">{s.empty}</p>
          </div>
        ) : (
          <>
            {/* Table header — visible on lg+, hidden on mobile where rows go vertical. */}
            <div className="hidden lg:grid grid-cols-[2fr_1.3fr_1.2fr_1.4fr_0.7fr] gap-3 px-6 py-2 text-[10px] uppercase tracking-wider text-tribe-dark-80 font-semibold border-b border-tribe-dark-40">
              <span>{s.columns.name}</span>
              <span>{s.columns.time}</span>
              <span>{s.columns.coach}</span>
              <span>{s.columns.enrollment}</span>
              <span className="text-right">{s.columns.status}</span>
            </div>
            <div className="divide-y divide-tribe-dark-40">
              {state.sessions.map((sess) => (
                <SessionRow key={sess.id} session={sess} copy={s} />
              ))}
            </div>
            <div className="px-6 py-4 border-t border-tribe-dark-40">
              <Link
                href="/os/schedule"
                className="flex items-center gap-2 text-sm font-semibold text-tribe-green hover:text-tribe-green-dark transition-colors"
              >
                {s.viewAll}
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
    <div className="lg:grid lg:grid-cols-[2fr_1.3fr_1.2fr_1.4fr_0.7fr] lg:gap-3 lg:items-center px-6 py-4 hover:bg-tribe-dark-40 transition-colors">
      <p className="text-sm font-semibold text-tribe-dark lg:truncate">{name}</p>
      <p className="text-xs text-tribe-dark-80 mt-0.5 lg:mt-0">{time}</p>
      <p className="text-xs text-tribe-dark-80 mt-0.5 lg:mt-0 lg:truncate">{coach}</p>
      <div className="mt-2 lg:mt-0 flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-tribe-dark-40 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isFull ? 'bg-tribe-danger' : isLow ? 'bg-tribe-warning' : 'bg-tribe-green'}`}
            style={{ width: `${enrollmentPct}%` }}
          />
        </div>
        <span className="text-[11px] text-tribe-dark-80 font-medium shrink-0 tabular-nums">
          {enrolled}/{max || '—'}
        </span>
      </div>
      <div className="mt-2 lg:mt-0 lg:text-right">
        <StatusBadge full={isFull} low={isLow} copy={s} />
      </div>
    </div>
  );
}

function StatusBadge({ full, low, copy: s }: { full: boolean; low: boolean; copy: typeof copy.en | typeof copy.es }) {
  // Inline rather than using <Badge /> so we keep the tracking-wider
  // uppercase microtype that the mockup specifies for these.
  if (full) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-red-100 text-tribe-danger">
        {s.statusFull}
      </span>
    );
  }
  if (low) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-tribe-peach text-tribe-warning">
        {s.statusOpen}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider rounded-full bg-tribe-sky text-tribe-info">
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
