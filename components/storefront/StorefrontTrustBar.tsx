'use client';

import { Star, Clock, Calendar } from 'lucide-react';
import type { Instructor } from '@/app/storefront/[id]/useStorefrontData';

interface StorefrontTrustBarProps {
  instructor: Instructor;
  language: 'en' | 'es';
  /** horizontal = mobile strip, vertical = desktop sidebar */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Trust bar (spec 6A/6B): Rating, Sessions Led, Years on Tribe.
 * Horizontal three-up strip on mobile, vertical stack in the desktop
 * sidebar. Theme tokens only.
 */
export default function StorefrontTrustBar({
  instructor,
  language,
  orientation = 'horizontal',
}: StorefrontTrustBarProps) {
  const hasReviews = (instructor.total_reviews ?? 0) > 0;
  // Use the real maintained counter (migration 148); coalesce null to 0. The old
  // `?? sessions.length` fallback showed the count of UPCOMING active sessions (a
  // future-facing number) under the past-facing "Sessions led" label, and never
  // fired anyway for a stored 0 (?? only triggers on null).
  const sessionsLed = instructor.total_sessions_hosted ?? 0;
  const years = instructor.years_experience ?? 0;

  // THE THREE TILES WERE EMPTY IN THREE DIFFERENT WAYS AND ALL THREE PRINTED THE
  // SAME EM DASH (T-AUD13). Em dashes are banned across the product, but the
  // replacement is not one substitution: a missing rating and a zero session
  // count are not the same fact, and neither is a years field nobody filled in.
  //
  //   Rating           ABSENT. No one has reviewed yet. "0.0" would assert a bad
  //                    rating that nobody gave, so the tile is omitted. Same call
  //                    RatingStars already makes in InstructorCard, which returns
  //                    a no-rating label off the review COUNT.
  //   Sessions led     A MEASURED ZERO since migration 148 made the counter real.
  //                    Zero sessions led is a true statement about this
  //                    instructor, so it renders as 0. Hiding it behind a dash
  //                    was the only one of the three that destroyed information.
  //   Years            ABSENT. Self-reported and optional; empty means they did
  //                    not say, not that they have no experience. Tile omitted.
  //
  // So the bar carries only tiles that state something true, and sizes itself.
  const items: { icon: typeof Star; value: string; label: string }[] = [];

  if (hasReviews) {
    items.push({
      icon: Star,
      value: Number(instructor.average_rating ?? 0).toFixed(1),
      label: language === 'es' ? 'Calificación' : 'Rating',
    });
  }

  items.push({
    icon: Calendar,
    value: String(sessionsLed),
    label: language === 'es' ? 'Sesiones dirigidas' : 'Sessions led',
  });

  if (years > 0) {
    items.push({
      icon: Clock,
      value: String(years),
      label: language === 'es' ? 'Años de experiencia' : 'Years of experience',
    });
  }

  const vertical = orientation === 'vertical';
  // Written out rather than interpolated: Tailwind scans source text, so a
  // computed `grid-cols-${n}` is never emitted into the stylesheet.
  const columns = items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div
      className={
        vertical
          ? 'flex flex-col divide-y divide-theme rounded-2xl bg-theme-card border border-theme'
          : `grid ${columns} gap-2`
      }
    >
      {items.map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className={
            vertical
              ? 'flex items-center gap-3 px-4 py-3'
              : 'flex flex-col items-center text-center rounded-2xl bg-theme-card border border-theme p-3'
          }
        >
          <div className={vertical ? 'flex items-center gap-1.5' : 'flex items-center gap-1 mb-0.5'}>
            <Icon className="w-4 h-4 text-tribe-green flex-shrink-0" />
            <span className="text-lg font-bold text-theme-primary">{value}</span>
          </div>
          <p className="text-xs text-theme-secondary">{label}</p>
        </div>
      ))}
    </div>
  );
}
