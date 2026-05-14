'use client';

/**
 * TrainingPatternInsight — small "this is how this member trains"
 * factoid strip for the client detail page.
 *
 * Pulls two patterns out of the member's attendance history:
 *   1. Day-of-week preference: which day(s) they show up on most
 *      often, and what share of their training that represents.
 *   2. Time-of-day preference: bucketed into Morning / Midday /
 *      Evening / Late based on the session's start_time (with
 *      attended_at as fallback).
 *
 * Why this surface earns its keep:
 *   - The AttendanceHeatmap above already shows the *visual* of a
 *     member's rhythm. This adds the *words* — "Anna trains
 *     Mon + Wed evenings, 78% of the time." A coach reading
 *     that knows when to schedule a 1:1 follow-up, when to
 *     gently chase a missed session, and which class slots to
 *     keep prioritising for retention.
 *   - It's also a vocabulary tool: it gives the coach the
 *     phrasing to use in WhatsApp ("hey, missed you at the Friday
 *     class…") that proves they're paying attention.
 *
 * Hidden when the member has fewer than 5 attended sessions — the
 * patterns are too noisy below that, and surfacing "trains on
 * Tuesday 100% of the time (from one session)" looks insulting.
 *
 * The computation itself lives in lib/trainingPattern.ts so it's
 * testable without React.
 */

import { useMemo } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import type { AttendanceWithSession } from '@/lib/dal/clients';
import { computeTrainingPattern, type TimeBucket } from '@/lib/trainingPattern';

interface TrainingPatternInsightProps {
  attendance: AttendanceWithSession[];
}

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Training pattern',
    dayLabel: (days: string, pct: number) => `${days} · ${pct}% of sessions`,
    timeLabel: (bucket: string, pct: number) => `${bucket} · ${pct}% of sessions`,
    weekdayShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    bucketMorning: 'Morning',
    bucketMidday: 'Midday',
    bucketEvening: 'Evening',
    bucketNight: 'Late',
  },
  es: {
    title: 'Patrón de entrenamiento',
    dayLabel: (days: string, pct: number) => `${days} · ${pct}% de las sesiones`,
    timeLabel: (bucket: string, pct: number) => `${bucket} · ${pct}% de las sesiones`,
    weekdayShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    bucketMorning: 'Mañana',
    bucketMidday: 'Mediodía',
    bucketEvening: 'Tarde',
    bucketNight: 'Noche',
  },
} as const;

function bucketLabel(bucket: TimeBucket, s: (typeof copy)[keyof typeof copy]): string {
  switch (bucket) {
    case 'morning':
      return s.bucketMorning;
    case 'midday':
      return s.bucketMidday;
    case 'evening':
      return s.bucketEvening;
    case 'night':
      return s.bucketNight;
    default:
      return '';
  }
}

export default function TrainingPatternInsight({ attendance }: TrainingPatternInsightProps) {
  const { language } = useLanguage();
  const s = copy[language];

  const pattern = useMemo(() => computeTrainingPattern(attendance), [attendance]);
  if (!pattern) return null;

  const dayLabel =
    pattern.secondaryDayIndex >= 0
      ? `${s.weekdayShort[pattern.topDayIndex]} + ${s.weekdayShort[pattern.secondaryDayIndex]}`
      : s.weekdayShort[pattern.topDayIndex];

  return (
    <section className="mt-6">
      <h2 className="text-xs uppercase tracking-[0.1em] text-gray-500 font-semibold mb-3">{s.title}</h2>
      <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-tribe-green-50 flex items-center justify-center shrink-0">
            <Calendar className="w-4 h-4 text-tribe-green-dark" />
          </div>
          <p className="text-sm text-gray-900 leading-snug">{s.dayLabel(dayLabel, pattern.topDayShare)}</p>
        </div>
        {pattern.topBucket !== 'unknown' ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-tribe-green-50 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-tribe-green-dark" />
            </div>
            <p className="text-sm text-gray-900 leading-snug">
              {s.timeLabel(bucketLabel(pattern.topBucket, s), pattern.topBucketShare)}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
