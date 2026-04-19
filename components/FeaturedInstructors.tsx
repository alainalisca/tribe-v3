'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchFeaturedInstructors } from '@/lib/dal/instructors';
import type { FeaturedInstructor } from '@/lib/dal/instructors';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Star, ChevronRight, BadgeCheck } from 'lucide-react';

interface FeaturedInstructorsProps {
  language: string;
}

/**
 * Home feed teaser section: "Train with an Instructor"
 * Shows a horizontal scroll of featured/verified instructors
 * with a "See All" link to the full /instructors marketplace page.
 */
export default function FeaturedInstructors({ language }: FeaturedInstructorsProps) {
  const [instructors, setInstructors] = useState<FeaturedInstructor[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const result = await fetchFeaturedInstructors(supabase, 8);
      if (result.success && result.data) {
        setInstructors(result.data);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  // Don't render if no instructors found
  if (!loading && instructors.length === 0) return null;

  return (
    <div className="bg-stone-100 dark:bg-tribe-surface rounded-xl p-5 mb-4">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-bold text-theme-primary">
            {language === 'es' ? 'Entrena con un Instructor' : 'Train with an Instructor'}
          </h2>
          <p className="text-xs text-theme-secondary">
            {language === 'es'
              ? 'Sesiones dirigidas por profesionales verificados'
              : 'Sessions led by verified professionals'}
          </p>
        </div>
        <Link
          href="/instructors"
          className="flex items-center gap-1 text-sm font-semibold text-tribe-green hover:underline"
        >
          {language === 'es' ? 'Ver todos' : 'See All'}
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Horizontal scroll of instructor cards */}
      {loading ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 w-40 h-48 bg-theme-card rounded-xl border border-theme animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {instructors.map((instructor) => (
            <Link
              key={instructor.id}
              href={`/storefront/${instructor.id}`}
              className="flex-shrink-0 w-40 bg-theme-card rounded-xl border border-theme p-3 hover:border-tribe-green transition active:scale-[0.98]"
            >
              {/* Avatar */}
              <div className="flex justify-center mb-2">
                <Avatar className="w-16 h-16 border-2 border-tribe-green">
                  <AvatarImage loading="lazy" src={instructor.avatar_url || undefined} alt={instructor.name || ''} />
                  <AvatarFallback className="bg-tribe-green text-xl font-bold text-slate-900">
                    {instructor.name?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
              </div>

              {/* Name + verified badge */}
              <div className="flex items-center justify-center gap-1 mb-1">
                <p className="text-sm font-bold text-theme-primary text-center truncate">{instructor.name}</p>
                {instructor.is_verified_instructor && <BadgeCheck className="w-4 h-4 text-tribe-green flex-shrink-0" />}
              </div>

              {/* Tagline or specialties */}
              <p className="text-xs text-theme-secondary text-center line-clamp-2 mb-2">
                {instructor.storefront_tagline ||
                  (instructor.specialties?.slice(0, 2).join(', ') ?? '') ||
                  (language === 'es' ? 'Instructor' : 'Instructor')}
              </p>

              {/* Rating + sessions */}
              <div className="flex items-center justify-center gap-2 text-xs">
                {instructor.average_rating && instructor.average_rating > 0 ? (
                  <span className="flex items-center gap-0.5 text-yellow-600">
                    <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
                    {Number(instructor.average_rating).toFixed(1)}
                  </span>
                ) : null}
                {instructor.total_sessions_hosted != null && instructor.total_sessions_hosted > 0 && (
                  <span className="text-theme-secondary">
                    {instructor.total_sessions_hosted} {language === 'es' ? 'sesiones' : 'sessions'}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
