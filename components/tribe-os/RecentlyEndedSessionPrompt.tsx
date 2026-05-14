'use client';

/**
 * Dashboard prompt: "You just finished class — record attendance."
 *
 * Surfaces sessions that ended in the last few hours. The whole
 * stickiness story for Tribe.OS depends on attendance data being
 * captured consistently — streaks, health status, churn risk, and
 * Celebrate Wins all key off client_attendance rows. The closer to
 * the end-of-class moment we ask the coach to record, the higher
 * the compliance. A nudge an hour later is dramatically more
 * effective than a "you should record attendance" reminder the
 * next day.
 *
 * Hidden entirely when there's nothing to surface. Most dashboard
 * loads aren't right after a class, so the resting state is
 * invisible — by design. We don't want a permanent "no recent
 * sessions" card cluttering the page.
 *
 * Each row links straight to /os/sessions/[id]/attendance, which
 * is the canonical bulk-attendance surface. No inline recording
 * here — we want the coach in the dedicated flow where they can
 * mark every confirmed participant and handle no-shows + payment.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, ChevronRight, Clock } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';
import { sportTranslations } from '@/lib/translations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/tribe-os/ui';

interface RecentlyEndedSession {
  id: string;
  title: string | null;
  sport: string;
  date: string;
  start_time: string;
  duration: number;
  ended_at_iso: string;
  minutes_since_ended: number;
  current_participants: number;
}

type WidgetState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; sessions: RecentlyEndedSession[] };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Record attendance',
    subtitle: 'A class just wrapped. Mark who showed up while it’s fresh.',
    minutesAgoLabel: (n: number) =>
      n === 0
        ? 'Just ended'
        : n === 1
          ? 'Ended 1 minute ago'
          : n < 60
            ? `Ended ${n} minutes ago`
            : 'Ended over an hour ago',
    sessionCountLabel: (n: number) => (n === 1 ? '1 expected attendee' : `${n} expected attendees`),
    untitled: 'Untitled session',
    ctaAria: 'Record attendance for this session',
    ctaLabel: 'Record',
  },
  es: {
    title: 'Registrar asistencia',
    subtitle: 'Acaba de terminar una clase. Marca quién asistió mientras está fresco.',
    minutesAgoLabel: (n: number) =>
      n === 0
        ? 'Acaba de terminar'
        : n === 1
          ? 'Terminó hace 1 minuto'
          : n < 60
            ? `Terminó hace ${n} minutos`
            : 'Terminó hace más de una hora',
    sessionCountLabel: (n: number) => (n === 1 ? '1 asistente esperado' : `${n} asistentes esperados`),
    untitled: 'Sesión sin título',
    ctaAria: 'Registrar asistencia para esta sesión',
    ctaLabel: 'Registrar',
  },
} as const;

export default function RecentlyEndedSessionPrompt() {
  const { language } = useLanguage();
  const s = copy[language];
  const [state, setState] = useState<WidgetState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    (async () => {
      try {
        const res = await fetch('/api/tribe-os/dashboard/recently-ended/', { method: 'GET' });
        if (cancelled) return;
        const body = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { sessions?: RecentlyEndedSession[] };
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setState({ kind: 'error' });
          return;
        }
        const sessions = body.data.sessions ?? [];
        setState({ kind: 'ready', sessions });
        if (sessions.length > 0) {
          trackEvent('tribe_os_recently_ended_prompt_viewed', {
            session_count: sessions.length,
          });
        }
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Quiet on empty + quiet on error AND quiet during loading. The
  // dominant case is no sessions to surface (most dashboard loads
  // aren't right after a class), so rendering a skeleton on every
  // pageload would flash on screen and immediately vanish. Hiding
  // during loading lets the card appear only when there's actually
  // something to act on — also matches the documented design
  // philosophy in the header comment.
  if (state.kind === 'loading') return null;
  if (state.kind === 'ready' && state.sessions.length === 0) return null;
  if (state.kind === 'error') return null;

  return (
    <Card className="border-tribe-green/40 bg-tribe-green/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5 text-tribe-green-dark" />
          {s.title}
        </CardTitle>
        <p className="text-xs text-tribe-dark-80 mt-1">{s.subtitle}</p>
      </CardHeader>
      <CardContent className="p-0">
        {state.kind === 'loading' ? (
          <div className="px-6 py-4 space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-14 bg-tribe-dark-40 rounded-tribe animate-pulse" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-tribe-dark-40">
            {state.sessions.map((sess) => {
              const sportLabel =
                sportTranslations[sess.sport as keyof typeof sportTranslations]?.[language] ?? sess.sport;
              const title = sess.title || sportLabel || s.untitled;
              return (
                <li key={sess.id}>
                  <Link
                    href={`/os/sessions/${sess.id}/attendance`}
                    onClick={() =>
                      trackEvent('tribe_os_recently_ended_prompt_clicked', {
                        session_id: sess.id,
                        minutes_since_ended: sess.minutes_since_ended,
                      })
                    }
                    aria-label={s.ctaAria}
                    className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-tribe-green/5 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-tribe-dark truncate">{title}</p>
                      <p className="text-xs text-tribe-dark-80 mt-0.5 inline-flex items-center gap-1.5">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {s.minutesAgoLabel(sess.minutes_since_ended)}
                        {sess.current_participants > 0 ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{s.sessionCountLabel(sess.current_participants)}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-tribe-green-dark whitespace-nowrap">
                      {s.ctaLabel}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
