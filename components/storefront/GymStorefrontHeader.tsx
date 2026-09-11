'use client';

/**
 * The gym storefront header (T-GYM2).
 *
 * A business_type = 'gym' account rendered as an ordinary instructor storefront
 * -- a circular avatar and a green "Afiliado Destacado" pill, which athletes
 * read as "sponsored", not "this is a gym". This block replaces the person
 * framing with an organization one: square logo, building verified mark, type
 * line, and the two stats a gym actually has.
 *
 * NO RATING TILE. Gyms cannot be rated, and averaging the roster's ratings
 * would present a number about other people as a number about the gym
 * (settled 2026-09-08). Coaches and sessions-per-week instead.
 *
 * "Afiliado destacado" is not the headline here. It is the commercial
 * relationship, and it belongs under the address as one small line -- the
 * caller keeps rendering PartnerStorefrontBadge for that.
 */
import { Building2, MapPin } from 'lucide-react';
import GymChip from '@/components/partner/GymChip';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';

interface Props {
  partner: FeaturedPartner;
  coachCount: number;
  sessionsPerWeek: number;
}

export default function GymStorefrontHeader({ partner, coachCount, sessionsPerWeek }: Props) {
  const t = useTranslations('partner');
  const isStudio = partner.business_type === 'studio';
  const typeLabel = isStudio ? t('typeStudio') : t('typeGym');
  const specialties = (partner.specialties ?? []).slice(0, 2);

  return (
    <section className="bg-theme-card rounded-2xl border border-theme overflow-hidden">
      {partner.banner_url ? (
        <div className="h-28 w-full bg-theme-inset">
          <img src={partner.banner_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="h-20 w-full bg-gradient-to-r from-tribe-dark to-tribe-mid" />
      )}

      <div className="p-4 pt-0">
        {/* 72px rounded square, overlapping the banner. Never a circle: that is
            the whole identity rule, and this is the largest place it shows. */}
        <div className="-mt-9 mb-3">
          <GymChip
            name={partner.business_name}
            type={isStudio ? 'studio' : 'gym'}
            logoUrl={partner.logo_url}
            size="lg"
            hideName
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-theme-primary min-w-0">{partner.business_name}</h1>
          {partner.status === 'active' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-tribe-green/15 border border-tribe-green/30 px-2 py-0.5 text-[11px] font-bold text-tribe-green-dark">
              <Building2 className="w-3 h-3" />
              {isStudio ? t('verifiedLongStudio') : t('verifiedLong')}
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-theme-secondary">{[typeLabel, ...specialties].filter(Boolean).join(' · ')}</p>

        {partner.address && (
          <p className="mt-1 flex items-start gap-1 text-sm text-theme-tertiary">
            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="min-w-0">{partner.address}</span>
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-theme-inset p-3 text-center">
            <p className="text-lg font-bold text-theme-primary">{coachCount}</p>
            <p className="text-[11px] text-theme-tertiary">{t('coachesCount', { n: coachCount })}</p>
          </div>
          <div className="rounded-xl bg-theme-inset p-3 text-center">
            <p className="text-lg font-bold text-theme-primary">{sessionsPerWeek}</p>
            <p className="text-[11px] text-theme-tertiary">{t('sessionsPerWeek')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
