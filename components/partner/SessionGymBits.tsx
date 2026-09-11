'use client';

/**
 * The gym pieces of a session card (T-GYM1), kept out of SessionCard.tsx,
 * which sits at the 300-line limit.
 *
 * Three small pieces rather than one component, because they land in three
 * different places on the card: the hero's top-left slot, the instructor row,
 * and (for the creator only) the hero slot again while a request is pending.
 */

import { Clock, Building2 } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { SessionGymSource } from '@/lib/sessionGym';

/** First letters of the first two words: "CrossFit BullBox" -> "CB". */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * "Pendiente · {gym}" — the creator's own view while the gym decides.
 *
 * Also moved out of the hero: it names the gym, so it is gym identity and falls
 * under the same rule. It sits in the presenter row, where the approved mark
 * would be, since the two are mutually exclusive by definition.
 */
export function PendingVenueTag({ gym }: { gym: SessionGymSource }) {
  const t = useTranslations('partner');
  return (
    <span className="inline-flex items-center gap-1 bg-amber-500/90 text-slate-900 text-[11px] font-semibold px-2 py-1 rounded-lg">
      <Clock className="w-3 h-3" />
      {t('pendingTag', { gym: gym.business_name })}
    </span>
  );
}

/**
 * The single gym element in the presenter row (T-GYM1).
 *
 * Gym identity never appears over the photo (Al, 2026-09-10): the hero belongs
 * to LIVE, the photo counter and, later, the video pill. Three elements fought
 * for that corner and the gym name truncated to "CrossF...", which reads as
 * broken rather than branded.
 *
 * Same visual language as GymHostRow -- square mark, then the name -- but
 * subordinate to the person: smaller, muted, and after the instructor's rating
 * and session count, because on a coach-hosted session the coach is the host
 * and the gym is only the venue.
 *
 * The name is NOT truncated at a fraction of the row. It shrinks with the row
 * and wins space over the session count beside it, because a half-rendered gym
 * name is worse than a missing one.
 */
export function PresenterGymTag({ gym, asCoach }: { gym: SessionGymSource; asCoach: boolean }) {
  const t = useTranslations('partner');
  const label = asCoach ? t('coachAt', { gym: gym.business_name }) : gym.business_name;

  const body = (
    <>
      {gym.logo_url ? (
        <img src={gym.logo_url} alt="" className="w-4 h-4 rounded-sm object-cover flex-shrink-0" loading="lazy" />
      ) : (
        <span
          aria-hidden="true"
          className="w-4 h-4 rounded-sm bg-tribe-dark text-tribe-green text-[8px] font-bold flex items-center justify-center flex-shrink-0"
        >
          {monogram(gym.business_name)}
        </span>
      )}
      <span className="truncate">{label}</span>
    </>
  );

  const className = 'inline-flex items-center gap-1 min-w-0 text-[11px] font-semibold text-theme-secondary';

  if (!gym.user_id) {
    return <span className={className}>{body}</span>;
  }
  return (
    <Link href={`/storefront/${gym.user_id}`} onClick={(e) => e.stopPropagation()} className={className}>
      {body}
    </Link>
  );
}

/**
 * The gym as presenter: its square logo replaces the circle avatar, with a
 * building "Verificado" mark and the roster count. No star rating — gyms are
 * not rated in this ticket, and inventing one would be a fabricated number.
 */
export function GymHostRow({ gym, coachCount }: { gym: SessionGymSource; coachCount: number }) {
  const t = useTranslations('partner');
  return (
    <>
      {gym.logo_url ? (
        <img src={gym.logo_url} alt="" className="w-6 h-6 rounded-md object-cover flex-shrink-0" loading="lazy" />
      ) : (
        <span
          aria-hidden="true"
          className="w-6 h-6 rounded-md bg-tribe-dark text-tribe-green text-[9px] font-bold flex items-center justify-center flex-shrink-0"
        >
          {monogram(gym.business_name)}
        </span>
      )}
      <span className="text-xs font-semibold text-theme-primary truncate">{gym.business_name}</span>
      <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-tribe-green-dark flex-shrink-0">
        <Building2 className="w-3 h-3" />
        {t('verified')}
      </span>
      {coachCount > 0 && (
        <span className="text-xs text-theme-tertiary flex-shrink-0">· {t('coachesCount', { n: coachCount })}</span>
      )}
    </>
  );
}
