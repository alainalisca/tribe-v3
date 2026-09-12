'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchActivePartners, incrementPartnerMetric, partnerLogoUrl } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';
import Image from 'next/image';
import { Star, ChevronRight, Users, Calendar } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';

/**
 * Trim to a whole word, so a clamped description never ends mid-word.
 * line-clamp handles the visual overflow; this handles the sentence.
 */
function clampToWords(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.–-]+$/, '') + '…';
}

/** First letters of the first two words: "CrossFit BullBox" -> "CB". */
function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export default function FeaturedPartnerBanner() {
  const { language } = useLanguage();
  const tPartner = useTranslations('partner');
  const router = useRouter();
  const supabase = createClient();
  const [partners, setPartners] = useState<FeaturedPartner[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const impressionTracked = useRef<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const result = await fetchActivePartners(supabase, 5);
      if (result.success && result.data && result.data.length > 0) {
        setPartners(result.data);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track impression when a partner is shown
  useEffect(() => {
    if (partners.length === 0) return;
    const partner = partners[currentIndex];
    if (!partner || impressionTracked.current.has(partner.id)) return;
    impressionTracked.current.add(partner.id);
    incrementPartnerMetric(supabase, partner.id, 'total_impressions');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, partners]);

  if (partners.length === 0) {
    return <BecomePartnerCTA />;
  }

  const partner = partners[currentIndex];
  if (!partner) return null;

  // Field selection, not copy: description_es is a separate COLUMN, so this
  // picks a row value rather than a UI string and does not belong in messages/.
  const desc = (language === 'es' && partner.description_es) || partner.description;
  const logoUrl = partnerLogoUrl(partner);

  function handleClick() {
    incrementPartnerMetric(supabase, partner.id, 'total_clicks');
    router.push(`/storefront/${partner.user_id}`);
  }

  return (
    /* Matches the feed rather than inverting it.
       This was a near-black gradient card sitting in a column of light cards,
       and it read as something pasted in from another product -- Al flagged it
       unprompted. Nothing recorded the inversion as deliberate: it arrived in a
       14-feature mega-spec PR with no comment and no design note.
       Featured status is now carried by the AFILIADO DESTACADO badge and a
       tribe-green border, not by flipping the whole surface. */
    <div
      onClick={handleClick}
      className="relative cursor-pointer rounded-2xl border-2 border-tribe-green/40 bg-theme-card overflow-hidden mb-4"
    >
      <div className="relative p-4">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-tribe-green/15 border border-tribe-green/40 text-tribe-green-dark text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide mb-3">
          <Star className="w-3 h-3 fill-tribe-green" />
          {tPartner('featuredAffiliate')}
        </div>

        {/* Content */}
        <div className="flex gap-3 items-center">
          {/* Logo/Avatar */}
          {/* Same chain as the storefront header and the discover tile:
              logo_url, then the partner account's avatar, monogram last. This
              showed "CB" for BullBox while both other surfaces showed its real
              logo, because it had no fallback of its own. */}
          <div className="relative flex-shrink-0 w-16 h-16 rounded-2xl bg-tribe-dark border-2 border-tribe-green flex items-center justify-center overflow-hidden">
            {logoUrl ? (
              <Image src={logoUrl} alt={partner.business_name} fill className="object-cover" unoptimized />
            ) : (
              /* T-GYM1: a monogram, not an emoji. 🏋️/🏢 read as decoration and
                 as "no logo"; initials on the brand square read as an
                 organization that simply has not uploaded one yet. */
              <span aria-hidden="true" className="text-tribe-green text-xl font-bold tracking-tight">
                {monogram(partner.business_name)}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-theme-primary font-bold text-base leading-tight truncate">{partner.business_name}</h3>
              {/* Only gyms and studios carry a type label; an 'independent'
                  partner is a person and calling them a Gimnasio would be wrong. */}
              {(partner.business_type === 'gym' || partner.business_type === 'studio') && (
                <span className="flex-shrink-0 text-theme-tertiary text-[10px] font-bold tracking-wide uppercase">
                  {partner.business_type === 'gym' ? tPartner('typeGym') : tPartner('typeStudio')}
                </span>
              )}
            </div>
            {/* line-clamp alone cuts mid-word, so a long description ended on a
                fragment. Trimmed to a word boundary first; the clamp then only
                has to handle the narrow-screen case. */}
            {desc && (
              <p className="text-theme-secondary text-xs leading-snug line-clamp-2 mt-0.5">{clampToWords(desc, 120)}</p>
            )}
          </div>
        </div>

        {/* Stats row.
            Two stats were removed here, both fabricated, on the most-seen
            surface in the app:

              "Rating"       was partner.min_rating -- the CONTRACT MINIMUM,
                             rendered as a score. BullBox has zero reviews and
                             this told every athlete in the feed it was rated 4.
              "Sesiones/sem" was partner.min_sessions_per_month -- the monthly
                             contractual minimum, under a WEEKLY label. Wrong
                             number and wrong unit. A real weekly count exists
                             (GymsAndStudiosSection computes it) and can return
                             properly in the banner redesign.

            Athletes is real (total_bookings) and stays, but hides at zero --
            same rule as the gym storefront: a zero stat is worse than no stat.
            With all three gone the row does not render at all, which is
            correct. No stats beats three wrong ones. */}
        {partner.total_bookings > 0 && (
          <div className="flex gap-5 mt-3">
            <PartnerStat value={`${partner.total_bookings}`} label={tPartner('athletes')} />
          </div>
        )}

        {/* Specialties tags */}
        {partner.specialties && partner.specialties.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-3">
            {partner.specialties.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="bg-tribe-green/15 border border-tribe-green/40 text-tribe-green-dark text-[11px] px-2.5 py-0.5 rounded-full font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* CTA */}
        <button
          className="w-full mt-3 bg-tribe-green text-slate-900 font-bold text-sm py-2.5 rounded-xl flex items-center justify-center gap-1"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          {partner.business_type === 'studio' ? tPartner('viewStudio') : tPartner('viewGym')}
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Carousel dots */}
        {partners.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-2.5">
            {partners.map((_, i) => (
              <button
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentIndex(i);
                }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${
                  i === currentIndex ? 'bg-tribe-green w-4' : 'bg-theme-inset'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PartnerStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-extrabold text-tribe-green-dark">{value}</div>
      <div className="text-[10px] text-theme-tertiary">{label}</div>
    </div>
  );
}

/** Fallback CTA banner shown when no active partners exist */
function BecomePartnerCTA() {
  const router = useRouter();
  const t = useTranslations('partner');

  return (
    <div
      onClick={() => router.push('/partners')}
      className="relative cursor-pointer rounded-2xl border-2 border-dashed border-tribe-green/40 overflow-hidden mb-4 bg-theme-card hover:border-tribe-green/60 transition"
    >
      <div className="p-4 text-center">
        <div className="inline-flex items-center gap-1.5 bg-tribe-green/15 border border-tribe-green/40 text-tribe-green-dark text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide mb-2">
          <Star className="w-3 h-3 fill-tribe-green" />
          {t('featuredAffiliatesTitle')}
        </div>
        <p className="text-theme-primary font-bold text-sm mb-1">{t('ownAGym')}</p>
        <p className="text-theme-secondary text-xs mb-3">{t('ownAGymBody')}</p>
        <span className="inline-flex items-center gap-1 bg-tribe-green text-slate-900 font-bold text-xs px-4 py-2 rounded-xl">
          {t('learnMore')}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}
