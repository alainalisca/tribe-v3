'use client';

/**
 * "Gimnasios y estudios" on /instructors (T-GYM2).
 *
 * Gyms are excluded from the instructor tiles above -- they are organizations,
 * not people -- so without this section they would be absent from discovery
 * entirely. Square marks, never circles: the same identity rule the card and
 * the storefront use, applied to the third surface an athlete meets a gym on.
 */
import Link from 'next/link';
import GymChip from '@/components/partner/GymChip';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { trackEvent } from '@/lib/analytics';
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';

interface Props {
  gyms: GymDirectoryEntry[];
}

export default function GymsAndStudiosSection({ gyms }: Props) {
  const t = useTranslations('partner');
  // Hides itself rather than showing an empty heading.
  if (gyms.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-theme-primary mb-3">{t('gymsAndStudios')}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {gyms.map((gym) => (
          <Link
            key={gym.id}
            href={`/storefront/${gym.user_id}`}
            onClick={() => trackEvent('gym_tile_tapped', { partner_id: gym.id, business_type: gym.business_type })}
            className="flex items-center gap-2.5 rounded-2xl border border-theme bg-theme-card p-3 min-w-0"
          >
            <GymChip
              name={gym.business_name}
              type={gym.business_type === 'studio' ? 'studio' : 'gym'}
              logoUrl={gym.logo_url}
              size="md"
              hideName
            />
            <span className="min-w-0 flex flex-col leading-tight">
              <span className="text-sm font-semibold text-theme-primary truncate">{gym.business_name}</span>
              <span className="text-[11px] text-theme-tertiary truncate">
                {gym.business_type === 'studio' ? t('typeStudio') : t('typeGym')}
                {gym.coachCount > 0 && ` · ${t('coachesCount', { n: gym.coachCount })}`}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
