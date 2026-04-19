'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Star, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getCurrentSpotlight, type SpotlightWithInstructor } from '@/lib/dal/spotlight';
import { trackEvent } from '@/lib/analytics';
import { sportTranslations } from '@/lib/translations';

interface SpotlightBannerProps {
  language: 'en' | 'es';
}

export default function SpotlightBanner({ language }: SpotlightBannerProps) {
  const [spotlight, setSpotlight] = useState<SpotlightWithInstructor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    async function load() {
      const res = await getCurrentSpotlight(supabase);
      if (cancelled) return;
      if (res.success) {
        setSpotlight(res.data ?? null);
        if (res.data?.instructor) {
          trackEvent('spotlight_impression', { instructor_id: res.data.instructor.id });
        }
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !spotlight || !spotlight.instructor) return null;

  const instructor = spotlight.instructor;
  const quote =
    (language === 'es' ? spotlight.featured_quote_es : spotlight.featured_quote) ?? spotlight.featured_quote ?? null;
  const specialtiesLabel = (instructor.specialties || [])
    .slice(0, 3)
    .map((s) => (language === 'es' ? sportTranslations[s]?.es || s : sportTranslations[s]?.en || s))
    .join(', ');

  const onClick = () => {
    trackEvent('spotlight_clicked', { instructor_id: instructor.id });
  };

  return (
    <section className="relative rounded-2xl overflow-hidden bg-[#3D4349] border border-[#84cc16]/30">
      {/* Banner background */}
      <div className="relative h-40 w-full bg-gradient-to-br from-[#3D4349] to-[#272D34]">
        {instructor.storefront_banner_url ? (
          <Image
            src={instructor.storefront_banner_url}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover opacity-70"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-[#272D34] via-[#272D34]/60 to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#84cc16] text-slate-900 text-[10px] font-bold uppercase tracking-wider">
          <Sparkles className="w-3 h-3" />
          {language === 'es' ? 'Instructor de la Semana' : 'Instructor of the Week'}
        </div>
      </div>

      <div className="px-5 pb-5 -mt-10 relative">
        <div className="flex items-end gap-3">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[#84cc16] bg-[#272D34] relative flex-shrink-0">
            {instructor.avatar_url ? (
              <Image src={instructor.avatar_url} alt={instructor.name} fill sizes="80px" className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl text-white">
                {instructor.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 pb-1">
            <h3 className="text-lg font-bold text-white truncate">{instructor.name}</h3>
            <p className="text-xs text-gray-300 flex items-center gap-1 flex-wrap">
              {instructor.total_reviews != null && instructor.total_reviews > 0 && (
                <>
                  <Star className="w-3 h-3 fill-[#F59E0B] text-[#F59E0B]" />
                  <span className="font-semibold text-white">{(instructor.average_rating ?? 0).toFixed(1)}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="truncate">{specialtiesLabel}</span>
            </p>
          </div>
        </div>

        {quote && <p className="mt-3 text-sm italic text-gray-200">&ldquo;{quote}&rdquo;</p>}

        <div className="mt-4 flex gap-2">
          <Link
            href={`/storefront/${instructor.id}`}
            onClick={onClick}
            className="flex-1 py-2 rounded-lg bg-[#84cc16] hover:bg-[#A3E635] text-slate-900 text-sm font-bold text-center"
          >
            {language === 'es' ? 'Ver Perfil' : 'View Profile'}
          </Link>
          <Link
            href={`/storefront/${instructor.id}?tab=sessions`}
            onClick={onClick}
            className="flex-1 py-2 rounded-lg bg-[#272D34] text-gray-200 hover:text-white text-sm font-semibold text-center"
          >
            {language === 'es' ? 'Reservar Sesión' : 'Book Session'}
          </Link>
        </div>
      </div>
    </section>
  );
}
