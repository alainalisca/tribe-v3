/** Sub-component: shows instructors that match the user's training preferences */
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { fetchInstructors, type InstructorProfile } from '@/lib/dal/instructors';
import { SPORTS_TRANSLATIONS, type Sport } from '@/lib/sports';
import Image from 'next/image';
import { Star } from 'lucide-react';
import Link from 'next/link';

interface Props {
  selectedSports: string[];
}

export default function MatchingInstructorResults({ selectedSports }: Props) {
  const supabase = createClient();
  const { language } = useLanguage();
  const isEs = language === 'es';

  const [instructors, setInstructors] = useState<InstructorProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInstructors();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps handled manually
  }, [selectedSports.join(',')]);

  async function loadInstructors() {
    setLoading(true);
    // Try filtered first, fall back to all instructors if no matches
    if (selectedSports.length > 0) {
      const results: InstructorProfile[] = [];
      const seen = new Set<string>();
      for (const sport of selectedSports) {
        const res = await fetchInstructors(supabase, { sport, limit: 10 });
        if (res.success && res.data) {
          for (const inst of res.data) {
            if (!seen.has(inst.id)) {
              seen.add(inst.id);
              results.push(inst);
            }
          }
        }
      }
      if (results.length > 0) {
        setInstructors(results);
        setLoading(false);
        return;
      }
    }
    // Fallback: show all instructors
    const res = await fetchInstructors(supabase, { limit: 12 });
    setInstructors(res.success && res.data ? res.data : []);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-tribe-green" />
      </div>
    );
  }

  if (instructors.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-theme-primary mb-3">
        {isEs ? 'Instructores que coinciden con tus preferencias' : 'Instructors matching your preferences'}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {instructors.map((inst) => (
          <Link
            key={inst.id}
            href={`/profile/${inst.id}`}
            className="block rounded-xl bg-stone-100 dark:bg-tribe-surface p-3 hover:ring-2 hover:ring-tribe-green transition"
          >
            <div className="flex items-center gap-2 mb-2">
              {inst.avatar_url ? (
                <Image
                  src={inst.avatar_url}
                  alt={inst.name || ''}
                  width={36}
                  height={36}
                  className="rounded-full object-cover w-9 h-9"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-stone-300 dark:bg-tribe-mid" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-theme-primary truncate">
                  {inst.name || (isEs ? 'Instructor' : 'Instructor')}
                </p>
                {inst.average_rating > 0 && (
                  <div className="flex items-center gap-0.5 text-xs text-stone-500 dark:text-gray-400">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    {inst.average_rating.toFixed(1)}
                  </div>
                )}
              </div>
            </div>
            {inst.specialties.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {inst.specialties.slice(0, 2).map((s) => (
                  <span
                    key={s}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-tribe-green/20 text-tribe-green font-medium"
                  >
                    {SPORTS_TRANSLATIONS[s as Sport]?.[language] || s}
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-tribe-green font-medium mt-2">
              {isEs ? 'Ver perfil' : 'View Storefront'} &rarr;
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
