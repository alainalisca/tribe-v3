'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchActivePartners, incrementPartnerMetric } from '@/lib/dal/featuredPartners';
import type { FeaturedPartner } from '@/lib/dal/featuredPartners';
import { Star, ChevronRight, Users, Calendar } from 'lucide-react';

export default function FeaturedPartnerBanner() {
  const { language } = useLanguage();
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
    return <BecomePartnerCTA language={language} />;
  }

  const partner = partners[currentIndex];
  if (!partner) return null;

  const desc = language === 'es' ? partner.description_es || partner.description : partner.description;

  function handleClick() {
    incrementPartnerMetric(supabase, partner.id, 'total_clicks');
    router.push(`/storefront/${partner.user_id}`);
  }

  function handleNext() {
    setCurrentIndex((prev) => (prev + 1) % partners.length);
  }

  return (
    <div
      onClick={handleClick}
      className="relative cursor-pointer rounded-2xl border border-tribe-green/30 overflow-hidden mb-4"
      style={{
        background: 'linear-gradient(135deg, #1a2a1a 0%, #2a3a2a 50%, #1a2a1a 100%)',
      }}
    >
      {/* Subtle glow */}
      <div className="absolute -top-12 -right-8 w-48 h-48 rounded-full bg-tribe-green/[0.08] blur-2xl pointer-events-none" />

      <div className="relative p-4">
        {/* Badge */}
        <div className="inline-flex items-center gap-1.5 bg-tribe-green/15 border border-tribe-green/30 text-tribe-green text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide mb-3">
          <Star className="w-3 h-3 fill-tribe-green" />
          {language === 'es' ? 'Socio Destacado' : 'Featured Partner'}
        </div>

        {/* Content */}
        <div className="flex gap-3 items-center">
          {/* Logo/Avatar */}
          <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-[#52575D] border-2 border-tribe-green flex items-center justify-center overflow-hidden">
            {partner.logo_url ? (
              <img src={partner.logo_url} alt={partner.business_name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl">{partner.business_type === 'gym' ? '🏋️' : '🏢'}</span>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base leading-tight truncate">{partner.business_name}</h3>
            {desc && <p className="text-[#B1B3B6] text-xs leading-snug line-clamp-2 mt-0.5">{desc}</p>}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-5 mt-3">
          <PartnerStat value={partner.min_rating.toString()} label={language === 'es' ? 'Rating' : 'Rating'} />
          <PartnerStat
            value={`${partner.min_sessions_per_month}+`}
            label={language === 'es' ? 'Sesiones/sem' : 'Sessions/wk'}
          />
          <PartnerStat value={`${partner.total_bookings}`} label={language === 'es' ? 'Atletas' : 'Athletes'} />
        </div>

        {/* Specialties tags */}
        {partner.specialties && partner.specialties.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-3">
            {partner.specialties.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="bg-tribe-green/15 border border-tribe-green/30 text-tribe-green text-[11px] px-2.5 py-0.5 rounded-full font-medium"
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
          {language === 'es' ? 'Ver Estudio' : 'View Studio'}
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
                  i === currentIndex ? 'bg-tribe-green w-4' : 'bg-[#52575D]'
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
      <div className="text-lg font-extrabold text-tribe-green">{value}</div>
      <div className="text-[10px] text-[#B1B3B6]">{label}</div>
    </div>
  );
}

/** Fallback CTA banner shown when no active partners exist */
function BecomePartnerCTA({ language }: { language: string }) {
  const router = useRouter();

  return (
    <div
      onClick={() => router.push('/partners')}
      className="relative cursor-pointer rounded-2xl border border-dashed border-tribe-green/40 overflow-hidden mb-4 bg-[#272D34] hover:border-tribe-green/60 transition"
    >
      <div className="p-4 text-center">
        <div className="inline-flex items-center gap-1.5 bg-tribe-green/15 border border-tribe-green/30 text-tribe-green text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide mb-2">
          <Star className="w-3 h-3 fill-tribe-green" />
          {language === 'es' ? 'Socios Destacados' : 'Featured Partners'}
        </div>
        <p className="text-white font-bold text-sm mb-1">
          {language === 'es' ? '¿Tienes un estudio o gimnasio?' : 'Own a studio or gym?'}
        </p>
        <p className="text-[#B1B3B6] text-xs mb-3">
          {language === 'es'
            ? 'Destaca tu negocio y conecta con atletas locales'
            : 'Get featured and connect with local athletes'}
        </p>
        <span className="inline-flex items-center gap-1 bg-tribe-green text-slate-900 font-bold text-xs px-4 py-2 rounded-xl">
          {language === 'es' ? 'Conocer más' : 'Learn More'}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </div>
  );
}
