const BOGOTA = 'America/Bogota';

function toBogotaDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BOGOTA });
}

function todayBogota(now?: Date): string {
  return (now ?? new Date()).toLocaleDateString('en-CA', { timeZone: BOGOTA });
}

export function daysSinceVisit(visitedAt: string | null, now?: Date): number | null {
  if (!visitedAt) return null;
  const visitDate = toBogotaDate(visitedAt);
  const today = todayBogota(now);
  const visitMs = new Date(visitDate).getTime();
  const todayMs = new Date(today).getTime();
  return Math.max(0, Math.round((todayMs - visitMs) / 86_400_000));
}
