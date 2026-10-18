'use client';

import { useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react';
import { downloadCalendarEvent, getGoogleCalendarUrl } from '@/lib/calendar';
import { trackEvent } from '@/lib/analytics';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * T-UI-SD1: the session page's calendar buttons as one row. "Agregar al
 * calendario" opens the two choices in place (Google in a new tab, Apple as
 * an .ics download), replacing the two separate calendar boxes the page had.
 */
export default function AddToCalendarRow({
  sessionId,
  title,
  hostName,
  date,
  startTime,
  durationMinutes,
  location,
  userState,
}: {
  sessionId: string;
  title: string;
  hostName: string | null;
  date: string;
  startTime: string | null;
  durationMinutes: number | null;
  location: string | null;
  userState: 'joined' | 'creator';
}) {
  const t = useTranslations('sessionDetail');
  const [open, setOpen] = useState(false);
  const url = () => `${window.location.origin}/session/${sessionId}/`;
  const event = () => ({
    title,
    description: `Session with ${hostName || 'Instructor'} on Tribe.`,
    startDate: new Date(`${date}T${startTime || '00:00'}`),
    durationMinutes: durationMinutes || 60,
    location: location || undefined,
    url: url(),
  });
  const option =
    'flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-white dark:bg-tribe-surface text-stone-900 dark:text-white text-sm font-semibold rounded-lg border border-stone-200 dark:border-gray-600 hover:bg-stone-50 dark:hover:bg-tribe-mid transition';

  return (
    <div className="rounded-xl bg-white dark:bg-tribe-card border border-stone-200 dark:border-tribe-mid">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-stone-900 dark:text-white"
      >
        <span className="flex items-center gap-3">
          <CalendarIcon className="w-5 h-5 text-muted-foreground" />
          {t('addToCalendar')}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="flex gap-2 px-4 pb-4">
          <a
            href={getGoogleCalendarUrl(event())}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              trackEvent('session_calendar_added', { session_id: sessionId, provider: 'google', user_state: userState })
            }
            className={option}
          >
            {t('calendarGoogle')}
          </a>
          <button
            type="button"
            onClick={() => {
              downloadCalendarEvent(event());
              trackEvent('session_calendar_added', { session_id: sessionId, provider: 'apple', user_state: userState });
            }}
            className={option}
          >
            {t('calendarApple')}
          </button>
        </div>
      )}
    </div>
  );
}
