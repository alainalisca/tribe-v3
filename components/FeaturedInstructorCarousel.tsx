'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logError } from '@/lib/logger';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Star, CheckCircle, Zap, TrendingUp } from 'lucide-react';
import type { InstructorProfile } from '@/lib/dal/instructors';

interface Props {
  language: 'en' | 'es';
}

function toProfile(row: Record<string, unknown>): InstructorProfile {
  return {
    id: row.id as string,
    name: row.name as string | null,
    avatar_url: row.avatar_url as string | null,
    tagline: (row.storefront_tagline as string) ?? null,
    location: (row.location as string) ?? null,
    specialties: (row.specialties as string[]) || [],
    verified: (row.is_verified_instructor as boolean) ?? false,
    average_rating: (row.average_rating as number) ?? 0,
    total_reviews: (row.total_reviews as number) ?? 0,
    total_sessions: (row.total_sessions_hosted as number) ?? 0,
    is_instructor: true,
    created_at: row.created_at as string,
    location_lat: (row.location_lat as number) ?? null,
    location_lng: (row.location_lng as number) ?? null,
    years_experience: (row.years_experience as number) ?? 0,
  };
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

const SELECT_COLS =
  'id, name, avatar_url, specialties, average_rating, total_reviews, total_sessions_hosted, storefront_tagline, is_verified_instructor, location, location_lat, location_lng, years_experience, created_at';

export default function FeaturedInstructorCarousel({ language }: Props) {
  const supabase = createClient();
  const [featured, setFeatured] = useState<InstructorProfile[]>([]);

  const t = {
    featured: language === 'es' ? 'Destacados' : 'Featured',
    featuredDesc: language === 'es' ? 'Instructores promovidos activamente' : 'Actively promoted instructors',
    boosted: language === 'es' ? 'Destacado' : 'Featured',
    allInstructors: language === 'es' ? 'Todos los Instructores' : 'All Instructors',
  };

  useEffect(() => {
    loadFeatured();
  }, []);

  async function loadFeatured() {
    try {
      const now = new Date().toISOString();
      const { data: boostData } = await supabase
        .from('boost_campaigns')
        .select('instructor_id')
        .eq('status', 'active')
        .lte('starts_at', now)
        .gte('ends_at', now);

      const { data: proData } = await supabase
        .from('users')
        .select(SELECT_COLS)
        .eq('is_instructor', true)
        .eq('storefront_tier', 'pro');

      const boostedIds = new Set<string>((boostData || []).map((r: { instructor_id: string }) => r.instructor_id));
      const proProfiles = (proData || []).map(toProfile);
      const proIds = new Set(proProfiles.map((i) => i.id));
      const missingIds = [...boostedIds].filter((id) => !proIds.has(id));

      let boostedProfiles: InstructorProfile[] = [];
      if (missingIds.length > 0) {
        const { data } = await supabase
          .from('users')
          .select(SELECT_COLS)
          .in('id', missingIds)
          .eq('is_instructor', true);
        boostedProfiles = (data || []).map(toProfile);
      }

      const all = [...boostedProfiles, ...proProfiles];
      const unique = all.filter((inst, i, self) => self.findIndex((x) => x.id === inst.id) === i);
      unique.sort((a, b) => b.average_rating - a.average_rating || b.total_sessions - a.total_sessions);
      setFeatured(unique);
    } catch (error) {
      logError(error, { action: 'loadFeatured' });
    }
  }

  if (featured.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-tribe-green" />
        <h2 className="text-lg font-bold text-theme-primary">{t.featured}</h2>
      </div>
      <p className="text-xs text-theme-secondary -mt-1">{t.featuredDesc}</p>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory">
        {featured.map((inst) => (
          <Link key={`featured-${inst.id}`} href={`/storefront/${inst.id}`} className="snap-start shrink-0 w-44">
            <div className="relative bg-gradient-to-br from-tribe-green/10 to-tribe-green/5 border border-tribe-green/30 rounded-xl p-3 hover:border-tribe-green transition h-full">
              <div className="absolute -top-2 -right-2 bg-tribe-green text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {t.boosted}
              </div>
              <div className="flex flex-col items-center text-center">
                <Avatar className="w-14 h-14 border-2 border-tribe-green mb-2">
                  <AvatarImage loading="lazy" src={inst.avatar_url || undefined} alt={inst.name || ''} />
                  <AvatarFallback className="bg-tribe-green text-sm font-bold text-slate-900">
                    {initials(inst.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex items-center gap-1 mb-1">
                  <h3 className="font-bold text-theme-primary text-xs leading-tight truncate max-w-[120px]">
                    {inst.name}
                  </h3>
                  {inst.verified && <CheckCircle className="w-3.5 h-3.5 text-tribe-green shrink-0" />}
                </div>
                {inst.total_reviews > 0 && (
                  <div className="flex items-center gap-1 mb-1">
                    <Star className="w-3 h-3 fill-tribe-green text-tribe-green" />
                    <span className="text-[11px] font-semibold text-theme-primary">
                      {inst.average_rating.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-theme-secondary">({inst.total_reviews})</span>
                  </div>
                )}
                {inst.specialties.length > 0 && (
                  <span className="px-2 py-0.5 bg-tribe-green/20 text-tribe-green text-[10px] font-medium rounded-full truncate max-w-[120px]">
                    {inst.specialties[0]}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
        <span className="text-xs font-semibold text-theme-secondary">{t.allInstructors}</span>
        <div className="flex-1 h-px bg-stone-200 dark:bg-stone-700" />
      </div>
    </div>
  );
}
