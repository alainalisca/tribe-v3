'use client';

import { useTranslations } from '@/lib/i18n/useTranslations';

interface SessionMetaBadgesProps {
  genderPreference?: string | null;
  skillLevel?: string | null;
}

/**
 * Gender and skill pills for the session card.
 *
 * Only values that carry information render. 276 of 311 live sessions are
 * gender 'all' and 181 are 'all_levels', so badging those would put a pill on
 * almost every card that tells an athlete nothing.
 *
 * No emoji: they render inconsistently across Android and iOS and clash with
 * the lucide icon set the rest of the card uses.
 */
export default function SessionMetaBadges({ genderPreference, skillLevel }: SessionMetaBadgesProps) {
  const t = useTranslations('sessionCard');

  const gender =
    genderPreference === 'women_only'
      ? { label: t('womenOnly'), className: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200' }
      : genderPreference === 'men_only'
        ? { label: t('menOnly'), className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200' }
        : null;

  const skill =
    skillLevel === 'beginner'
      ? { label: t('beginner'), className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200' }
      : skillLevel === 'intermediate'
        ? { label: t('intermediate'), className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200' }
        : skillLevel === 'advanced'
          ? {
              label: t('advanced'),
              className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
            }
          : null;

  if (!gender && !skill) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {[gender, skill].filter(Boolean).map((badge) => (
        <span key={badge!.label} className={`px-2 py-0.5 rounded-full text-xs font-semibold ${badge!.className}`}>
          {badge!.label}
        </span>
      ))}
    </div>
  );
}
