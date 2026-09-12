'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchActivePartners, incrementPartnerMetric, partnerLogoUrl } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';
import Image from 'next/image';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from '@/lib/i18n/useTranslations';
import PartnerCard from '@/components/partner/FeaturedPartnerCard';
import { useCarouselIndex } from '@/hooks/useCarouselIndex';
import { usePointerDragScroll } from '@/hooks/usePointerDragScroll';

export default function FeaturedPartnerBanner() {
  const { language } = useLanguage();
  const tPartner = useTranslations('partner');
  const router = useRouter();
  const supabase = createClient();
  const [partners, setPartners] = useState<FeaturedPartner[]>([]);
  const impressionTracked = useRef<Set<string>>(new Set());
  // Both hooks are the session card's, unchanged: useCarouselIndex derives the
  // active slide from scrollLeft, usePointerDragScroll adds mouse drag that a
  // native scroll container otherwise ignores.
  const { trackRef, index, scrollBySlides } = useCarouselIndex(partners.length);
  const { dragging, handlers } = usePointerDragScroll({ trackRef, count: partners.length });

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
    const partner = partners[index];
    if (!partner || impressionTracked.current.has(partner.id)) return;
    impressionTracked.current.add(partner.id);
    incrementPartnerMetric(supabase, partner.id, 'total_impressions');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, partners]);

  function handleClick(partner: FeaturedPartner) {
    incrementPartnerMetric(supabase, partner.id, 'total_clicks');
    router.push(`/storefront/${partner.user_id}`);
  }

  if (partners.length === 0) {
    return <BecomePartnerCTA />;
  }

  return (
    /* One scroll-snap track, not a state swap.
       The banner rendered a single partner and changed it with setState, which
       meant NO swipe on mobile at all -- there were no pointer handlers and no
       scroll container. A native track gives touch swipe for free, and the
       T-UI4 drag hook gives the mouse the same gesture, since a native scroll
       container ignores mouse drag entirely.

       Matches the feed rather than inverting it: this was a near-black gradient
       card in a column of light cards and read as pasted in from another
       product. Featured status is the badge and the green border. */
    <div className="relative mb-4">
      <div
        ref={trackRef}
        {...handlers}
        className={`flex overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide rounded-2xl ${
          partners.length > 1 ? 'md:cursor-grab' : ''
        } ${dragging ? 'select-none md:cursor-grabbing' : ''}`}
      >
        {partners.map((p: FeaturedPartner) => (
          <div key={p.id} className="w-full flex-shrink-0 snap-start">
            <PartnerCard partner={p} language={language} onOpen={() => handleClick(p)} />
          </div>
        ))}
      </div>

      {partners.length > 1 && (
        /* Pagination row: arrows flanking the dots, BELOW the card.
           The mechanism is the session card's and stays so -- same 40px hit
           areas, same scrollBySlides, same drag and swipe. The PLACEMENT is
           not, because the context is not: on SessionCardHero the chevrons
           float over a photo, where overlaying is correct. Here they floated
           over text, landing on the "CrossFit" tag and drawing a focus ring
           across it.

           Always visible rather than hover-only, since out here they are a
           control rather than an overlay -- and the dark circle that gave them
           contrast against a photo is gone for the same reason: on a light row
           it read as a sticker. */
        <div className="flex items-center justify-center gap-1 mt-2.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollBySlides(-1);
            }}
            aria-label={tPartner('previousPartner')}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-theme-tertiary hover:text-theme-primary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* The dots WERE buttons already, but 6px with no padding is not a
              hittable target on a phone -- which is why they read as
              decoration. The dot stays 6px; the tap area around it is 40px,
              matching every other control in the app. */}
          {partners.map((p: FeaturedPartner, i: number) => (
            <button
              key={p.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scrollBySlides(i - index);
              }}
              aria-label={tPartner('goToPartner', { n: i + 1 })}
              aria-current={i === index}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center"
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'bg-tribe-green w-4' : 'bg-theme-inset w-1.5'
                }`}
              />
            </button>
          ))}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              scrollBySlides(1);
            }}
            aria-label={tPartner('nextPartner')}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-theme-tertiary hover:text-theme-primary transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

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
