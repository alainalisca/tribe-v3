'use client';

/**
 * StreakMilestoneChip — small celebratory badge for clients who
 * cross a streak threshold. Renders nothing when current streak is
 * below the lowest milestone, so most members never see it.
 *
 * Milestones (in days):
 *   - 7   "Week strong"
 *   - 14  "Two weeks"
 *   - 30  "30-day streak"
 *   - 100 "100 days"
 *
 * Used on both /os/clients/[id] (coach sees it → cue to acknowledge
 * the member) and /my-coach (member sees their own progress). Same
 * component, same styling.
 *
 * Why not a separate "celebration toast" that fires once: streaks
 * can break and rebuild, members may not log in the day they hit
 * the milestone, and we don't want the coach to miss the cue.
 * A persistent chip handles all of that — visible whenever the
 * streak qualifies, gone when it breaks.
 */

import { Flame } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

interface Props {
  currentStreakDays: number;
}

interface Milestone {
  threshold: number;
  // Color tier escalates with the threshold so the visual weight
  // matches the achievement.
  cls: string;
  labelKey: 'm7' | 'm14' | 'm30' | 'm100';
}

const MILESTONES: Milestone[] = [
  // Order matters — we pick the HIGHEST threshold the streak qualifies for.
  { threshold: 100, cls: 'bg-tribe-green/25 text-tribe-green-dark border-tribe-green/40', labelKey: 'm100' },
  { threshold: 30, cls: 'bg-tribe-green/20 text-tribe-green-dark border-tribe-green/35', labelKey: 'm30' },
  { threshold: 14, cls: 'bg-tribe-warning/15 text-tribe-warning border-tribe-warning/30', labelKey: 'm14' },
  { threshold: 7, cls: 'bg-tribe-info/15 text-tribe-info border-tribe-info/30', labelKey: 'm7' },
];

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    m7: 'Week strong',
    m14: 'Two weeks',
    m30: '30-day streak',
    m100: '100 days',
  },
  es: {
    m7: 'Una semana fuerte',
    m14: 'Dos semanas',
    m30: 'Racha de 30 días',
    m100: '100 días',
  },
} as const;

export default function StreakMilestoneChip({ currentStreakDays }: Props) {
  const { language } = useLanguage();
  const s = copy[language];

  // Pick the highest threshold this streak qualifies for. Returns
  // null when below all thresholds — the component renders nothing.
  const milestone = MILESTONES.find((m) => currentStreakDays >= m.threshold);
  if (!milestone) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.05em] rounded-full border ${milestone.cls}`}
      title={`${currentStreakDays} ${currentStreakDays === 1 ? 'day' : 'days'}`}
    >
      <Flame className="w-3 h-3" />
      {s[milestone.labelKey]}
    </span>
  );
}
