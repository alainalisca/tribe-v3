import { bogotaToday } from '@/lib/tribe-os/dates';

export interface MemberProgress {
  visitCount: number;
  expectedVisits: number;
  onTrack: boolean;
  weeksElapsed: number;
}

export function computeMemberProgress(
  startsAt: string | null,
  endsAt: string | null,
  targetPerWeek: number | null,
  visitCount: number,
  today?: string,
): MemberProgress | null {
  if (!startsAt || !targetPerWeek || targetPerWeek < 1) return null;

  const todayStr = today ?? bogotaToday();
  const capDate = endsAt && endsAt < todayStr ? endsAt : todayStr;

  if (capDate < startsAt) {
    return { visitCount, expectedVisits: 0, onTrack: true, weeksElapsed: 0 };
  }

  const startMs = new Date(startsAt + 'T00:00:00Z').getTime();
  const capMs = new Date(capDate + 'T00:00:00Z').getTime();
  const daysElapsed = Math.floor((capMs - startMs) / 86_400_000) + 1;
  const weeksElapsed = Math.max(1, Math.ceil(daysElapsed / 7));
  const expectedVisits = targetPerWeek * weeksElapsed;

  return {
    visitCount,
    expectedVisits,
    onTrack: visitCount >= expectedVisits,
    weeksElapsed,
  };
}

export function progressLabel(progress: MemberProgress | null, lang: 'en' | 'es'): string {
  if (!progress) return '';
  return progress.onTrack
    ? (lang === 'es' ? 'Al día' : 'On track')
    : (lang === 'es' ? 'Atrasado' : 'Behind');
}
