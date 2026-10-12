'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import CoachPlanBadge from '@/components/CoachPlanBadge';
import { useLanguage } from '@/lib/LanguageContext';
import { formatSessionDate, formatTime12Hour } from '@/lib/utils';
import { translateSport } from '@/lib/translations';
import { selectCoachesDestacados } from '@/lib/coachesDestacados';
import { isCoachPlansEnabled } from '@/lib/subscription/coachPlans';
import type { SessionWithRelations } from '@/lib/dal';

interface CoachesDestacadosRowProps {
  /** The sessions the feed already loaded; the row derives from them (no extra query). */
  sessions: SessionWithRelations[];
}

/**
 * T-PLAN1 part D: a horizontal "Coaches destacados" row at the top of the home
 * feed: upcoming sessions (next 7 days) by Coach Pro, Tribe Crecimiento and
 * Embajador coaches, soonest first, max 10. Hidden when there are none, and
 * entirely while COACH_PLANS_ENABLED is off. Named so it does not collide with
 * the /instructors "Destacados" carousel, which is a different thing.
 */
export default function CoachesDestacadosRow({ sessions }: CoachesDestacadosRowProps) {
  const { language } = useLanguage();
  if (!isCoachPlansEnabled()) return null;
  const picks = selectCoachesDestacados(sessions);
  if (picks.length === 0) return null;

  return (
    <section className="mb-6" aria-label={language === 'es' ? 'Coaches destacados' : 'Featured coaches'}>
      <h2 className="text-lg font-bold text-theme-primary mb-3">
        {language === 'es' ? 'Coaches destacados' : 'Featured coaches'}
      </h2>
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 scrollbar-hide">
        {picks.map((s) => {
          // formatSessionDate pins the UTC frame; a plain toLocaleDateString on
          // the parsed date showed the day before in Bogota (found 2026-10-12).
          const day = formatSessionDate(s.date, language, { weekday: 'short', day: 'numeric', month: 'short' });
          const coachName = s.creator?.name ?? '';
          return (
            <Link
              key={s.id}
              href={`/session/${s.id}/`}
              className="snap-start flex-shrink-0 w-60 rounded-xl border border-theme bg-theme-card p-3 hover:border-tribe-green transition"
            >
              <p className="text-xs font-semibold text-tribe-green uppercase tracking-wide">
                {translateSport(s.sport, language)}
              </p>
              <p className="mt-1 text-sm font-bold text-theme-primary line-clamp-2">{s.title || coachName}</p>
              <p className="mt-1 text-xs text-theme-secondary">
                {day}
                {s.start_time ? ` · ${formatTime12Hour(s.start_time)}` : ''}
              </p>
              <div className="mt-3 flex items-center gap-2 min-w-0">
                <Avatar className="w-6 h-6">
                  <AvatarImage loading="lazy" src={s.creator?.avatar_url || undefined} />
                  <AvatarFallback className="bg-tribe-green text-slate-900 font-bold text-[10px]">
                    {coachName[0]?.toUpperCase() || 'T'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-xs text-theme-primary truncate">{coachName}</span>
                <CoachPlanBadge plan={s.creator?.coach_plan} />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
