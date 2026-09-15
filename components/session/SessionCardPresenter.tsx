'use client';

/**
 * Who is presenting a session card: an instructor, or the gym itself (T-GYM1).
 *
 * Extracted from SessionCard.tsx, which the gym work pushed past the 300-line
 * limit. The two cases are genuinely different shapes rather than one shape
 * with a flag: a person gets a circle avatar, a star rating and a session
 * count; an organization gets a square logo, a building "Verificado" mark and
 * a coach count, and no rating at all, because gyms are not rated and inventing
 * a number would be a fabrication.
 */

import { Star } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { PresenterGymTag, PendingVenueTag, GymHostRow } from '@/components/partner/SessionGymBits';
import { presenterGymMark, type SessionGymIdentity } from '@/lib/sessionGym';

interface SessionCardPresenterProps {
  gym: SessionGymIdentity;
  creator: { name?: string | null; avatar_url?: string | null; average_rating?: number | string | null } | null;
  instructorName: string;
  sessionsHosted: number;
  coachCount: number;
  /** useTranslations('sessionCard'), passed down so this stays presentational. */
  tCard: (key: string, values?: Record<string, string | number>) => string;
}

export default function SessionCardPresenter({
  gym,
  creator,
  instructorName,
  sessionsHosted,
  coachCount,
  tCard,
}: SessionCardPresenterProps) {
  if (gym.gymHosted && gym.venue) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <GymHostRow gym={gym.venue} coachCount={coachCount} />
      </div>
    );
  }

  if (!creator) return <div className="flex items-center gap-2 min-w-0" />;

  // One gym element, never two -- see presenterGymMark for which fact wins.
  const mark = presenterGymMark(gym);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Avatar className="w-6 h-6" aria-label={tCard('instructorLabel', { name: instructorName })}>
        <AvatarImage loading="lazy" src={creator.avatar_url || undefined} />
        <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-[10px]">
          {creator.name?.[0]?.toUpperCase() || 'U'}
        </AvatarFallback>
      </Avatar>
      {Number(creator.average_rating) > 0 && (
        <span className="text-xs text-yellow-500 font-semibold flex items-center gap-0.5">
          <Star className="w-3 h-3 fill-yellow-500" />
          {Number(creator.average_rating).toFixed(1)}
        </span>
      )}
      {sessionsHosted > 0 && (
        <span className="text-xs text-theme-tertiary flex-shrink-0">
          · {tCard('sessionsHosted', { count: sessionsHosted })}
        </span>
      )}
      {gym.pending ? (
        <PendingVenueTag gym={gym.pending} />
      ) : (
        mark && <PresenterGymTag gym={mark.gym} asCoach={mark.asCoach} />
      )}
    </div>
  );
}
