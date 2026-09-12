'use client';

/**
 * "Gimnasios y estudios" on /instructors (T-GYM2).
 *
 * Gyms are excluded from the instructor tiles above -- they are organisations,
 * not people -- so without this section they would be absent from discovery
 * entirely.
 *
 * The first version was a narrow chip left-aligned under a three-column grid of
 * full cards, which read as a footer note rather than a category. It now uses
 * the same Card shell, the same grid and the same information order as
 * InstructorCard, so one gym occupies one cell and looks deliberate.
 *
 * The ONE deliberate difference is the shape of the image: a rounded square
 * where the instructor card has a circle. That contrast is the whole visual
 * grammar from T-GYM1 -- people are circles, organisations are rounded squares
 * -- so it is the one thing that must not be harmonised away.
 *
 * NO RATING, EVER. Gyms cannot be rated; the type line occupies the slot where
 * the instructor card shows stars.
 */
import Link from 'next/link';
import { Building2, MapPin, Calendar } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { trackEvent } from '@/lib/analytics';
import { neighborhoodFromAddress } from '@/lib/sessionLocation';
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';

interface Props {
  gyms: GymDirectoryEntry[];
}

/** First letters of the first two words: "CrossFit BullBox" -> "CB". */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function GymsAndStudiosSection({ gyms }: Props) {
  const t = useTranslations('partner');
  // Hides itself rather than showing an empty heading.
  if (gyms.length === 0) return null;

  return (
    <section className="mt-10">
      {/* Same weight as "Descubre Instructores", so this reads as a category
          rather than an afterthought. */}
      <h2 className="text-xl font-bold text-theme-primary mb-4">{t('gymsAndStudios')}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {gyms.map((gym) => {
          // Same fallback chain as the storefront header, so a gym cannot show
          // its logo on one surface and a monogram on the other.
          const logo = gym.logo_url || gym.accountAvatarUrl || null;
          const where = neighborhoodFromAddress(gym.address);
          const typeLabel = gym.business_type === 'studio' ? t('typeStudio') : t('typeGym');
          const specialty = (gym.specialties ?? [])[0];

          return (
            <Card
              key={gym.id}
              className="bg-theme-card border-theme hover:border-tribe-green transition overflow-hidden flex flex-col"
            >
              <CardContent className="p-4 flex flex-col h-full">
                <div className="flex flex-col items-center mb-4">
                  {/* 80px ROUNDED SQUARE where InstructorCard has an 80px circle. */}
                  <div className="w-20 h-20 rounded-2xl border-[3px] border-tribe-green mb-3 overflow-hidden bg-tribe-dark flex items-center justify-center">
                    {logo ? (
                      <img src={logo} alt="" className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span aria-hidden="true" className="text-lg font-bold text-tribe-green">
                        {monogram(gym.business_name)}
                      </span>
                    )}
                  </div>

                  <div className="text-center w-full">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <h3 className="font-bold text-theme-primary text-sm leading-tight">{gym.business_name}</h3>
                      {/* Building2 where the instructor card puts CheckCircle. */}
                      <Building2 className="w-4 h-4 text-tribe-green flex-shrink-0" />
                    </div>
                    {/* The type line sits where the instructor card shows a rating. */}
                    <p className="text-xs text-theme-secondary">{[typeLabel, specialty].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-4 text-xs text-theme-secondary flex-grow">
                  {/* No line at all when the address has no recognised
                      neighbourhood: a street on a directory tile reads as a bug. */}
                  {where && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-stone-400" />
                      <span className="truncate">{where}</span>
                    </div>
                  )}
                  {gym.sessionsPerWeek > 0 && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-tribe-green" />
                      <span>{`${gym.sessionsPerWeek} ${t('sessionsPerWeek')}`}</span>
                    </div>
                  )}
                </div>

                <Link
                  href={`/storefront/${gym.user_id}`}
                  onClick={() =>
                    trackEvent('gym_tile_tapped', { partner_id: gym.id, business_type: gym.business_type })
                  }
                  className="w-full py-2 rounded-xl bg-tribe-green text-slate-900 text-sm font-bold text-center"
                >
                  {t('viewGym')}
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
