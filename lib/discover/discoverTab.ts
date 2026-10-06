/**
 * The two halves of Discover (/instructors): people and organizations.
 *
 * T-GYM1 split gyms out of the instructor grid (people are circles,
 * organizations are rounded squares) and put them in a section BELOW the grid.
 * With 10+ instructors that section sat several screens down, so an athlete
 * looking for a gym had no way to get to one without scrolling past every
 * instructor first. This is the switch that was missing: the two lists are
 * peers, chosen at the top.
 *
 * The URL carries the choice so a gym-only link can be shared (Ana's posts,
 * a partner's bio, a QR) and so the back button returns to the tab you left.
 * The param value is Spanish because the link is shared in Medellín; the
 * parser is case-insensitive and accepts the English word too.
 */
import type { GymDirectoryEntry } from '@/lib/dal/gymDirectory';

export type DiscoverTab = 'instructors' | 'gyms';

export const DISCOVER_TAB_PARAM = 'ver';
export const GYMS_TAB_VALUE = 'gimnasios';

/** Anything unrecognised, missing or repeated falls back to instructors. */
export function parseDiscoverTab(value: string | string[] | undefined | null): DiscoverTab {
  const v = Array.isArray(value) ? value[0] : value;
  const normalized = (v ?? '').trim().toLowerCase();
  return normalized === GYMS_TAB_VALUE || normalized === 'gyms' ? 'gyms' : 'instructors';
}

/** The query string for a tab. Instructors is the default, so it has none. */
export function discoverTabQuery(tab: DiscoverTab): string {
  return tab === 'gyms' ? `?${DISCOVER_TAB_PARAM}=${GYMS_TAB_VALUE}` : '';
}

/**
 * Search over gyms, matching what an athlete would type: the gym's name, what
 * it teaches, or where it is. Accent-insensitive, because "poblado" must find
 * "El Poblado" and "jiu jitsu" typed without the accent a gym used must still
 * match.
 */
export function filterGyms(gyms: GymDirectoryEntry[], query: string): GymDirectoryEntry[] {
  const q = fold(query);
  if (!q) return gyms;
  return gyms.filter((g) =>
    [g.business_name, g.address, ...(g.specialties ?? [])].some((field) => fold(field ?? '').includes(q))
  );
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
