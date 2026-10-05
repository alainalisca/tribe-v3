'use client';

/**
 * T-AV29 (P1-2). "Escríbele a {coach} por WhatsApp" on the instructor
 * storefront and on session detail.
 *
 * Renders nothing unless: the athlete_value feature "contact" is on for the
 * viewer, the viewer is not the coach, and the coach opted in AND saved a
 * number (av_coach_contact_options returns the number only then).
 *
 * The button is a real link, not a click handler that opens one after an
 * await: iOS Safari blocks a window opened after an asynchronous step, and in
 * the app a wa.me link is handed to WhatsApp directly. The tap is logged on
 * click without waiting, so the log never delays or blocks the link.
 */
import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAthleteValueFeature } from '@/lib/features/useAthleteValueFeature';
import { fetchCoachContactOptions, logCoachContactTap, type ContactSource } from '@/lib/dal/coachContact';
import { whatsappButtonLabel, whatsappHref } from '@/lib/coachContact/whatsappLink';

export const CONTACT_FEATURE = 'contact';

interface Props {
  coachId: string;
  coachName: string | null;
  viewerId: string | null;
  source: ContactSource;
  sessionId?: string | null;
  language: 'en' | 'es';
  /** Wrapper classes, applied only when the button renders, so it adds no gap when it does not. */
  className?: string;
}

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
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const isCoach = viewerId !== null && viewerId === coachId;

  useEffect(() => {
    if (!enabled || isCoach || !viewerId) return;
    let cancelled = false;
    void fetchCoachContactOptions(createClient(), coachId).then((r) => {
      if (!cancelled && r.success) setWhatsapp(r.data?.whatsapp ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, isCoach, viewerId, coachId]);

  if (!enabled || isCoach || !viewerId || !whatsapp) return null;

  return (
    <div className={className}>
      <a
        href={whatsappHref(whatsapp, coachName, language)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          void logCoachContactTap(createClient(), { coachId, channel: 'whatsapp', source, sessionId });
        }}
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-xl bg-tribe-green text-tribe-dark font-bold"
      >
        <MessageCircle className="w-5 h-5" aria-hidden="true" />
        {whatsappButtonLabel(coachName, language)}
      </a>
    </div>
  );
}
