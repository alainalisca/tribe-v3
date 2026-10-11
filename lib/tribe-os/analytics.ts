/**
 * Pure aggregation helpers for /os/analytics.
 * All date math uses America/Bogota.
 */

const BOGOTA_TZ = 'America/Bogota';
const FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOGOTA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function toBogotaDate(isoOrTimestamp: string): string {
  const d = new Date(isoOrTimestamp);
  const p = FMT.formatToParts(d);
  const y = p.find((x) => x.type === 'year')!.value;
  const m = p.find((x) => x.type === 'month')!.value;
  const day = p.find((x) => x.type === 'day')!.value;
  return `${y}-${m}-${day}`;
}

export function toBogotaHour(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  const hFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: BOGOTA_TZ,
    hour: 'numeric',
    hour12: false,
  });
  return Number(hFmt.format(d));
}

export function toBogotaDow(isoTimestamp: string): number {
  const d = new Date(isoTimestamp);
  const dowFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: BOGOTA_TZ,
    weekday: 'short',
  });
  const day = dowFmt.format(d);
  const map: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  return map[day] ?? 0;
}

export interface WeekBucket {
  weekStart: string;
  label: string;
}

export function weekBuckets(todayBogota: string, weeks: number): WeekBucket[] {
  const td = new Date(todayBogota + 'T12:00:00Z');
  const dow = td.getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const thisMonday = new Date(td);
  thisMonday.setUTCDate(thisMonday.getUTCDate() - mondayOffset);

  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(thisMonday);
    start.setUTCDate(start.getUTCDate() - i * 7);
    const iso = start.toISOString().slice(0, 10);
    const m = start.getUTCMonth();
    const d = start.getUTCDate();
    const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    buckets.push({ weekStart: iso, label: `${d} ${MONTHS_ES[m]}` });
  }
  return buckets;
}

export function dateToWeekStart(dateStr: string, buckets: WeekBucket[]): string | null {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (dateStr >= buckets[i].weekStart) return buckets[i].weekStart;
  }
  return null;
}

export interface Visit {
  client_id: string;
  visited_at: string;
  class_name: string | null;
  coach_name: string | null;
}

export interface Touch {
  client_id: string;
  created_at: string;
}

export interface WeeklyAttendance {
  weekStart: string;
  label: string;
  totalVisits: number;
  uniqueMembers: number;
}

export function computeWeeklyAttendance(visits: Visit[], buckets: WeekBucket[]): WeeklyAttendance[] {
  const map = new Map<string, { total: number; members: Set<string> }>();
  for (const b of buckets) map.set(b.weekStart, { total: 0, members: new Set() });

  for (const v of visits) {
    const bogotaDate = toBogotaDate(v.visited_at);
    const ws = dateToWeekStart(bogotaDate, buckets);
    if (!ws) continue;
    const bucket = map.get(ws)!;
    bucket.total++;
    bucket.members.add(v.client_id + ':' + bogotaDate);
  }

  return buckets.map((b) => {
    const entry = map.get(b.weekStart)!;
    const uniqueDayMembers = new Set<string>();
    for (const key of entry.members) uniqueDayMembers.add(key.split(':')[0]);
    return {
      weekStart: b.weekStart,
      label: b.label,
      totalVisits: entry.total,
      uniqueMembers: uniqueDayMembers.size,
    };
  });
}

export interface PeakHourCell {
  dow: number;
  hour: number;
  count: number;
}

export function computePeakHours(visits: Visit[]): PeakHourCell[] {
  const grid = new Map<string, number>();
  for (const v of visits) {
    const dow = toBogotaDow(v.visited_at);
    const hour = toBogotaHour(v.visited_at);
    const key = `${dow}:${hour}`;
    grid.set(key, (grid.get(key) ?? 0) + 1);
  }
  const cells: PeakHourCell[] = [];
  for (const [key, count] of grid) {
    const [dow, hour] = key.split(':').map(Number);
    cells.push({ dow, hour, count });
  }
  return cells;
}

export interface ClassStat {
  className: string;
  visits: number;
  uniqueMembers: number;
}

export interface CoachStat {
  coachName: string;
  visits: number;
  uniqueMembers: number;
}

export function computeClassStats(visits: Visit[]): ClassStat[] {
  const map = new Map<string, { visits: number; members: Set<string> }>();
  for (const v of visits) {
    const name = v.class_name ?? '(Sin clase)';
    const entry = map.get(name) ?? { visits: 0, members: new Set<string>() };
    entry.visits++;
    entry.members.add(v.client_id);
    map.set(name, entry);
  }
  return Array.from(map.entries())
    .map(([className, { visits, members }]) => ({
      className,
      visits,
      uniqueMembers: members.size,
    }))
    .sort((a, b) => b.visits - a.visits);
}

export function computeCoachStats(visits: Visit[]): CoachStat[] {
  const map = new Map<string, { visits: number; members: Set<string> }>();
  for (const v of visits) {
    const name = v.coach_name ?? '(Sin coach)';
    const entry = map.get(name) ?? { visits: 0, members: new Set<string>() };
    entry.visits++;
    entry.members.add(v.client_id);
    map.set(name, entry);
  }
  return Array.from(map.entries())
    .map(([coachName, { visits, members }]) => ({
      coachName,
      visits,
      uniqueMembers: members.size,
    }))
    .sort((a, b) => b.visits - a.visits);
}

export interface ContactEffect {
  touchesInRange: number;
  cameBackCount: number;
  conversionPct: number;
  recoveredCentsPerMonth: number;
  weeklyTouches: { weekStart: string; label: string; touches: number; cameBack: number }[];
}

export function computeContactEffect(
  touches: Touch[],
  visits: Visit[],
  planValues: Map<string, number | null>,
  buckets: WeekBucket[],
): ContactEffect {
  const visitsByClient = new Map<string, string[]>();
  for (const v of visits) {
    const dates = visitsByClient.get(v.client_id) ?? [];
    dates.push(v.visited_at);
    visitsByClient.set(v.client_id, dates);
  }

  const touchWeekMap = new Map<string, { touches: number; cameBack: Set<string> }>();
  for (const b of buckets) touchWeekMap.set(b.weekStart, { touches: 0, cameBack: new Set() });

  let totalTouches = 0;
  const cameBackClients = new Set<string>();
  let recoveredCents = 0;

  for (const t of touches) {
    totalTouches++;
    const touchDate = toBogotaDate(t.created_at);
    const ws = dateToWeekStart(touchDate, buckets);
    if (ws) {
      const wEntry = touchWeekMap.get(ws)!;
      wEntry.touches++;
    }

    const clientVisits = visitsByClient.get(t.client_id) ?? [];
    const touchMs = new Date(t.created_at).getTime();
    const fourteenDaysMs = 14 * 86_400_000;
    const visitedAfter = clientVisits.some((vAt) => {
      const vMs = new Date(vAt).getTime();
      return vMs > touchMs && vMs <= touchMs + fourteenDaysMs;
    });

    if (visitedAfter) {
      cameBackClients.add(t.client_id);
      if (ws) touchWeekMap.get(ws)!.cameBack.add(t.client_id);
    }
  }

  for (const clientId of cameBackClients) {
    const val = planValues.get(clientId);
    if (val) recoveredCents += val;
  }

  return {
    touchesInRange: totalTouches,
    cameBackCount: cameBackClients.size,
    conversionPct: totalTouches > 0 ? Math.round((cameBackClients.size / totalTouches) * 100) : 0,
    recoveredCentsPerMonth: recoveredCents,
    weeklyTouches: buckets.map((b) => {
      const e = touchWeekMap.get(b.weekStart)!;
      return { weekStart: b.weekStart, label: b.label, touches: e.touches, cameBack: e.cameBack.size };
    }),
  };
}

export interface ActiveMembersResult {
  currentActive: number;
  newThisPeriod: number;
  returningThisPeriod: number;
}

export function computeActiveMembers(
  visits: Visit[],
  todayBogota: string,
  allClientIds: Set<string>,
  priorVisitClientIds: Set<string>,
): ActiveMembersResult {
  const td = new Date(todayBogota + 'T12:00:00Z');
  const twentyEightAgo = new Date(td);
  twentyEightAgo.setUTCDate(twentyEightAgo.getUTCDate() - 28);
  const cutoff = twentyEightAgo.toISOString().slice(0, 10);

  const activeSet = new Set<string>();
  for (const v of visits) {
    const bogotaDate = toBogotaDate(v.visited_at);
    if (bogotaDate >= cutoff) activeSet.add(v.client_id);
  }

  let newCount = 0;
  let returningCount = 0;
  for (const id of activeSet) {
    if (priorVisitClientIds.has(id)) returningCount++;
    else newCount++;
  }

  return {
    currentActive: activeSet.size,
    newThisPeriod: newCount,
    returningThisPeriod: returningCount,
  };
}
