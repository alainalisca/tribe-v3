'use client';

/**
 * T-AV29 (P1-2) and T-AV30 (P1-3). The coach contact buttons:
 *   "Escríbele a {coach} por WhatsApp"  storefront and session detail
 *   "Agenda una llamada gratis"         storefront only
 *
 * Renders nothing unless: the athlete_value feature "contact" is on for the
 * viewer, the viewer is not the coach, and the coach switched the channel on
 * (av_coach_contact_options returns a number only when the coach opted in and
 * saved one, and a link only when one is saved).
 *
 * Each button is a real link, not a click handler that opens one after an
 * await: iOS Safari blocks a window opened after an asynchronous step, and in
 * the app a wa.me link is handed to WhatsApp directly. The tap is logged on
 * click without waiting, so the log never delays or blocks the link.
 */
import { useEffect, useState } from 'react';
import { CalendarClock, MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import {
  fetchCoachContactOptions,
  logCoachContactTap,
  type CoachContactOptions,
  type ContactSource,
} from '@/lib/dal/coachContact';
import { whatsappButtonLabel, whatsappHref } from '@/lib/coachContact/whatsappLink';

export const CONTACT_FEATURE = 'contact';

interface Props {
  coachId: string;
  coachName: string | null;
  viewerId: string | null;
  source: ContactSource;
  sessionId?: string | null;
  language: 'en' | 'es';
  /** Wrapper classes, applied only when a button renders, so it adds no gap when none does. */
  className?: string;
}

const BUTTON = 'flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl font-bold';

export default function CoachContactButtons({
  coachId,
  coachName,
  viewerId,
  source,
  sessionId,
  language,
  className,
}: Props) {
  const enabled = useAthleteValueFeature(CONTACT_FEATURE);
  const [options, setOptions] = useState<CoachContactOptions>({ whatsapp: null, callLink: null });
  const isCoach = viewerId !== null && viewerId === coachId;

  useEffect(() => {
    if (!enabled || isCoach || !viewerId) return;
    let cancelled = false;
    void fetchCoachContactOptions(createClient(), coachId).then((r) => {
      if (!cancelled && r.success && r.data) setOptions(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isCoach, viewerId, coachId]);

  const whatsapp = options.whatsapp;
  // The call link is a storefront button only (Al, P1-3).
  const callLink = source === 'storefront' ? options.callLink : null;
  if (!enabled || isCoach || !viewerId || (!whatsapp && !callLink)) return null;

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {whatsapp && (
        <a
          href={whatsappHref(whatsapp, coachName, language)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void logCoachContactTap(createClient(), { coachId, channel: 'whatsapp', source, sessionId });
          }}
          className={`${BUTTON} bg-tribe-green text-tribe-dark`}
        >
          <MessageCircle className="w-5 h-5" aria-hidden="true" />
          {whatsappButtonLabel(coachName, language)}
        </a>
      )}
      {callLink && (
        <a
          href={callLink}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void logCoachContactTap(createClient(), { coachId, channel: 'call_link', source: 'storefront' });
          }}
          className={`${BUTTON} bg-tribe-dark text-white`}
        >
          <CalendarClock className="w-5 h-5" aria-hidden="true" />
          {language === 'es' ? 'Agenda una llamada gratis' : 'Book a free call'}
        </a>
      )}
    </div>
  );
}
