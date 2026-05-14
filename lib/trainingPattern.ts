/**
 * lib/trainingPattern.ts
 *
 * Pure computation for the TrainingPatternInsight component. Lives
 * here (not inside the component file) so it's importable from
 * Vitest without dragging in React / lucide / LanguageContext.
 *
 * Output shape is the minimum a render layer needs — it does NOT
 * pre-format strings, so localization stays inside the component.
 */

export type TimeBucket = 'morning' | 'midday' | 'evening' | 'night' | 'unknown';

/** The shape we expect from each attendance row. Loose enough to
 *  accept rows from listAttendanceForClient or any test fixture. */
export interface AttendanceLike {
  attended: boolean;
  attended_at: string | null;
  session?: { start_time: string | null } | null;
}

export interface TrainingPattern {
  /** 0-6 (Sun-Sat) — primary day of week. */
  topDayIndex: number;
  /**
   * Index of a secondary day when the top two days are within a
   * 3-percentage-point band (the M/W/F bimodal pattern). -1 when
   * the pattern is single-peaked.
   */
  secondaryDayIndex: number;
  /** Combined share (top + secondary if present) as 0-100. */
  topDayShare: number;
  /** Dominant time-of-day bucket. */
  topBucket: TimeBucket;
  /** Share for the dominant bucket as 0-100. */
  topBucketShare: number;
}

/** Minimum attended sessions for a pattern to be meaningful. */
export const MIN_SESSIONS_FOR_PATTERN = 5;

/** Bucket a HH:MM[:SS] time string. Simple wall-clock cuts. */
export function timeBucketFor(t: string | null | undefined): TimeBucket {
  if (!t) return 'unknown';
  const hh = Number.parseInt(t.slice(0, 2), 10);
  if (!Number.isFinite(hh)) return 'unknown';
  if (hh < 11) return 'morning';
  if (hh < 15) return 'midday';
  if (hh < 20) return 'evening';
  return 'night';
}

/**
 * Compute the dominant day(s) and time bucket from an attendance
 * list. Returns null when there's not enough signal (< 5 attended
 * sessions). The "secondary day" rule is what makes the M/W/F
 * pattern legible: if the top two days are within 3pp of each
 * other, we treat them as a combined preference.
 *
 * Time-bucket source-of-truth: prefer session.start_time when
 * present (the actual class slot), fall back to attended_at's
 * local hour. attended_at is sometimes timestamped at recording
 * time rather than the original session — start_time is the more
 * truthful signal when it's available.
 */
export function computeTrainingPattern(attendance: AttendanceLike[]): TrainingPattern | null {
  const attended = attendance.filter((a) => a.attended && a.attended_at);
  if (attended.length < MIN_SESSIONS_FOR_PATTERN) return null;
  const total = attended.length;

  // Day-of-week histogram. Use the local date so a 10pm session
  // reads as "that day" not "the next UTC day" for evening trainers.
  const dayCounts = new Array(7).fill(0) as number[];
  for (const a of attended) {
    const d = new Date(a.attended_at as string);
    dayCounts[d.getDay()] += 1;
  }
  let topIdx = 0;
  for (let i = 1; i < 7; i++) if (dayCounts[i] > dayCounts[topIdx]) topIdx = i;
  const topShare = Math.round((dayCounts[topIdx] / total) * 100);

  let secondaryIdx = -1;
  let secondaryCount = 0;
  for (let i = 0; i < 7; i++) {
    if (i === topIdx) continue;
    if (dayCounts[i] > secondaryCount) {
      secondaryCount = dayCounts[i];
      secondaryIdx = i;
    }
  }
  const secondaryShare = secondaryIdx >= 0 ? Math.round((secondaryCount / total) * 100) : 0;
  const includesSecondary = secondaryIdx >= 0 && topShare - secondaryShare <= 3 && secondaryShare > 0;
  const finalSecondary = includesSecondary ? secondaryIdx : -1;
  const finalShare = includesSecondary ? topShare + secondaryShare : topShare;

  // Time-of-day histogram. Build with start_time preferred,
  // attended_at hour as fallback.
  const buckets: Record<TimeBucket, number> = { morning: 0, midday: 0, evening: 0, night: 0, unknown: 0 };
  for (const a of attended) {
    let bucket: TimeBucket = 'unknown';
    if (a.session && a.session.start_time) {
      bucket = timeBucketFor(a.session.start_time);
    } else if (a.attended_at) {
      const d = new Date(a.attended_at);
      const hh = d.getHours();
      bucket = hh < 11 ? 'morning' : hh < 15 ? 'midday' : hh < 20 ? 'evening' : 'night';
    }
    buckets[bucket] += 1;
  }
  const orderedBuckets: TimeBucket[] = ['morning', 'midday', 'evening', 'night'];
  let topBucket: TimeBucket = 'unknown';
  let topBucketCount = 0;
  for (const b of orderedBuckets) {
    if (buckets[b] > topBucketCount) {
      topBucket = b;
      topBucketCount = buckets[b];
    }
  }
  const topBucketShare = topBucket === 'unknown' ? 0 : Math.round((topBucketCount / total) * 100);

  return {
    topDayIndex: topIdx,
    secondaryDayIndex: finalSecondary,
    topDayShare: finalShare,
    topBucket,
    topBucketShare,
  };
}
