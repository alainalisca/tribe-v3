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
import GymChip from '@/components/partner/GymChip';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { SessionGymSource, SessionGymIdentity } from '@/lib/sessionGym';

/** First letters of the first two words: "CrossFit BullBox" -> "CB". */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function GymHeroChip({ gym }: { gym: SessionGymSource }) {
  return (
    <div className="absolute top-3 left-3 z-10">
      <GymChip
        name={gym.business_name}
        type={gym.business_type === 'studio' ? 'studio' : 'gym'}
        logoUrl={gym.logo_url}
        size="sm"
        overPhoto
        href={gym.user_id ? `/storefront/${gym.user_id}` : undefined}
      />
    </div>
  );
}

/**
 * "Pendiente · {gym}" — the creator's own view while the gym decides.
 * Takes the same hero slot as the chip, since the two are mutually exclusive.
 */
export function PendingVenueTag({ gym }: { gym: SessionGymSource }) {
  const t = useTranslations('partner');
  return (
    <div className="absolute top-3 left-3 z-10">
      <span className="inline-flex items-center gap-1 bg-amber-500/90 text-slate-900 text-[11px] font-semibold px-2 py-1 rounded-lg">
        <Clock className="w-3 h-3" />
        {t('pendingTag', { gym: gym.business_name })}
      </span>
    </div>
  );
}

/**
 * "Coach BullBox" in the instructor row. Describes the person, so it renders
 * regardless of whether this particular session is at that gym.
 */
export function CoachAffiliationTag({ gym }: { gym: SessionGymSource }) {
  const t = useTranslations('partner');
  const label = t('coachAt', { gym: gym.business_name });

  const body = (
    <>
      {gym.logo_url ? (
        <img src={gym.logo_url} alt="" className="w-3.5 h-3.5 rounded-sm object-cover" loading="lazy" />
      ) : (
        <span
          aria-hidden="true"
          className="w-3.5 h-3.5 rounded-sm bg-tribe-dark text-tribe-green text-[7px] font-bold flex items-center justify-center"
        >
          {monogram(gym.business_name)}
        </span>
      )}
      {label}
    </>
  );

  const className =
    'inline-flex items-center gap-1 bg-theme-inset text-theme-secondary rounded-md px-1.5 py-0.5 text-[11px] font-semibold max-w-[45%] truncate';

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

/**
 * What belongs in the hero's top-left slot, if anything.
 *
 * The creator's pending tag wins over the chip: while a request is outstanding
 * there is no approved identity to show, and the creator is the only person who
 * sees anything at all. A gym hosting its own session shows no chip either --
 * it is already the presenter in the row below, and repeating the logo twice on
 * one card reads as a bug.
 */
export function HeroGymSlot({ gym }: { gym: SessionGymIdentity }) {
  if (gym.pending) return <PendingVenueTag gym={gym.pending} />;
  if (gym.venue && !gym.gymHosted) return <GymHeroChip gym={gym.venue} />;
  return null;
}
