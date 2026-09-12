'use client';

/**
 * The gym storefront header (T-GYM2).
 *
 * This REPLACES the person identity for an organisation -- StorefrontHero, all
 * three StorefrontTrustBar mounts and VideoIntro are gated off at page level.
 * The first version rendered below them instead, so a logged-out visitor saw
 * BullBox twice: two avatars, two names, and three person metrics showing
 * empty dashes.
 *
 * NO RATING TILE. Gyms cannot be rated, and averaging the roster's ratings
 * would present a number about other people as a number about the gym
 * (settled 2026-09-08). Sessions led and years of experience are person
 * metrics and go with it.
 */
import { Building2, MapPin, Star } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';

interface Props {
  partner: FeaturedPartner;
  /**
   * The gym's own user account. A gym's account avatar IS its logo in
   * practice, and its cover IS its banner, so falling back to them means every
   * future gym looks right on signup day with no data entry and no support
   * conversation about a field they cannot see in the UI.
   *
   * Scoped to organisations by construction: this component only renders for
   * business_type gym/studio, so an independent trainer's face is never
   * promoted to a logo.
   */
  account: { avatar_url?: string | null; storefront_banner_url?: string | null; banner_url?: string | null };
  coachCount: number;
  sessionsPerWeek: number;
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

export default function GymStorefrontHeader({ partner, account, coachCount, sessionsPerWeek }: Props) {
  const t = useTranslations('partner');
  const isStudio = partner.business_type === 'studio';
  const typeLabel = isStudio ? t('typeStudio') : t('typeGym');
  const specialties = (partner.specialties ?? []).slice(0, 2);

  const logo = partner.logo_url || account.avatar_url || null;
  const banner = partner.banner_url || account.storefront_banner_url || account.banner_url || null;

  // A single tile reads as orphaned -- the same visual problem as a lone chip
  // in a grid. One stat becomes a line of text; the row returns at two or more.
  const stats = [
    coachCount > 0 ? { value: coachCount, label: t('coachesCount', { n: coachCount }) } : null,
    sessionsPerWeek > 0 ? { value: sessionsPerWeek, label: t('sessionsPerWeek') } : null,
  ].filter(Boolean) as { value: number; label: string }[];

  return (
    <section className="bg-theme-card rounded-2xl border border-theme overflow-hidden">
      {banner ? (
        <div className="h-28 w-full bg-theme-inset">
          <img src={banner} alt="" className="w-full h-full object-cover" loading="lazy" />
        </div>
      ) : (
        <div className="h-20 w-full bg-gradient-to-r from-tribe-dark to-tribe-mid" />
      )}

      <div className="p-4 pt-0">
        {/* Rounded square, never a circle: organisations are squares, people
            are circles. This is the largest place that contrast shows. */}
        <div className="-mt-9 mb-3 w-[72px] h-[72px] rounded-2xl overflow-hidden border-4 border-theme-card bg-tribe-dark flex items-center justify-center">
          {logo ? (
            <img src={logo} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <span aria-hidden="true" className="text-2xl font-bold text-tribe-green">
              {monogram(partner.business_name)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* business_name, not the account's display name: "CrossFit BullBox"
              is the canonical identity, "BullBox" is what the user typed. */}
          <h1 className="text-xl font-bold text-theme-primary min-w-0">{partner.business_name}</h1>
          {partner.status === 'active' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-tribe-green/15 border border-tribe-green/30 px-2 py-0.5 text-[11px] font-bold text-tribe-green-dark">
              <Building2 className="w-3 h-3" />
              {isStudio ? t('verifiedLongStudio') : t('verifiedLong')}
            </span>
          )}
        </div>

        <p className="mt-1 text-sm text-theme-secondary">{[typeLabel, ...specialties].join(' · ')}</p>

        {partner.address && (
          <p className="mt-1 flex items-start gap-1 text-sm text-theme-tertiary">
            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="min-w-0">{partner.address}</span>
          </p>
        )}

        {stats.length === 1 && <p className="mt-1 text-sm text-theme-tertiary">{stats[0].label}</p>}

        {/* No date. When an affiliation started tells an athlete choosing a gym
            nothing, and it advertises how new the partnership is. */}
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-tribe-green-dark">
          <Star className="w-3 h-3 fill-tribe-green-dark" />
          {t('featuredAffiliate')}
        </p>

        {stats.length > 1 && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-theme-inset p-3 text-center">
                <p className="text-lg font-bold text-theme-primary">{s.value}</p>
                <p className="text-[11px] text-theme-tertiary">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
