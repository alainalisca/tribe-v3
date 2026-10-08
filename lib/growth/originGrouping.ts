/**
 * T-GROW1 part F, the arithmetic. Pure functions, no database, no React.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE REGROUPING HAPPENS HERE AND NOT IN SQL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * admin_attribution_summary (migration 213) returns one row per distinct
 * (src, code, utm_campaign, attr_ref) tuple. The tab's "group by" toggle then
 * collapses those rows along whichever dimension is chosen.
 *
 * That split is deliberate. A dynamic GROUP BY in SQL means either four
 * near-identical functions or one function taking a column name and building its
 * own query text -- and a function that interpolates a caller-supplied identifier
 * into SQL is the one shape nobody should add to this schema. The sums are
 * trivially correct in TypeScript because every lead and every event belongs to
 * EXACTLY ONE tuple, so collapsing along any dimension is addition and nothing
 * else.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE THING THAT CAN GO WRONG, AND IT IS NOT THE ADDITION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NULL is a real key, not a missing one. Most rows in this table today have null
 * in most dimensions: 2 of the 3 live pass leads carry no src and no code at all,
 * so "no source" is the single biggest row in the Origen table and the one the
 * programme exists to shrink.
 *
 * A Map keyed on a string handles that correctly only if null maps to a key no
 * real value can produce, and the obvious choices both fail. `String(null)` is
 * `"null"`, and `"null"` is a REACHABLE src: sanitizeTag's charset is
 * [A-Za-z0-9_-] lowercased, so `?src=null` yields exactly that string. Either
 * spelling would merge a real channel into the untagged row -- a channel
 * disappearing into the one row nobody looks at twice.
 *
 * So the sentinel is a character the charset forbids. The separator is a second
 * such character, for a different reason; both are explained at their
 * declarations, and lib/growth/originGrouping.test.ts has the arm for each.
 */

/** One row as admin_attribution_summary returns it. */
export interface OriginRow {
  src: string | null;
  code: string | null;
  utm_campaign: string | null;
  attr_ref: string | null;
  visits: number;
  leads: number;
  contacted: number;
  attended: number;
}

/** The dimensions the tab can group by. */
export const ORIGIN_GROUPINGS = ['src_code', 'utm_campaign', 'attr_ref'] as const;
export type OriginGrouping = (typeof ORIGIN_GROUPINGS)[number];

export function isOriginGrouping(value: unknown): value is OriginGrouping {
  return typeof value === 'string' && (ORIGIN_GROUPINGS as readonly string[]).includes(value);
}

/** A grouped row: the dimension values that define it, plus the summed counts. */
export interface OriginGroup {
  /** Stable key for React, and for nothing else. Never parsed back apart. */
  key: string;
  src: string | null;
  code: string | null;
  utm_campaign: string | null;
  attr_ref: string | null;
  visits: number;
  leads: number;
  contacted: number;
  attended: number;
}

/**
 * NOT 'null', and not any string the sanitizers can produce.
 *
 * sanitizeTag's charset is [A-Za-z0-9_-] lowercased, so `?src=null` yields the
 * literal string "null". A sentinel of 'null' would silently merge that into the
 * untagged row -- a real channel disappearing into the one row nobody looks at
 * twice. A NUL character cannot appear in a sanitized tag by construction.
 */
const NULL_KEY = '\u0000';

/**
 * A SEPARATOR, named and written as an escape rather than inlined as a raw
 * control byte, which is invisible to a reader and easy to lose in a copy.
 *
 * Joining the parts with '' would make the key non-injective: src='run'
 * code='club' and src='runc' code='lub' both produce "runclub", so two distinct
 * channels would collapse into one row whose counts are the sum of both -- a
 * wrong number presented exactly as confidently as a right one.
 *
 * A DIFFERENT character from NULL_KEY, so "no value" and "end of part" cannot be
 * confused. Both are outside sanitizeTag's [A-Za-z0-9_-] charset by construction,
 * which is what makes the key collision-free rather than merely unlikely.
 */
const KEY_SEP = '\u0001';

const keyPart = (value: string | null): string => value ?? NULL_KEY;

/** Which dimensions survive a given grouping; the rest collapse to null. */
function dimensionsFor(
  row: OriginRow,
  grouping: OriginGrouping
): Pick<OriginRow, 'src' | 'code' | 'utm_campaign' | 'attr_ref'> {
  switch (grouping) {
    case 'src_code':
      return { src: row.src, code: row.code, utm_campaign: null, attr_ref: null };
    case 'utm_campaign':
      return { src: null, code: null, utm_campaign: row.utm_campaign, attr_ref: null };
    case 'attr_ref':
      return { src: null, code: null, utm_campaign: null, attr_ref: row.attr_ref };
  }
}

/**
 * Collapse the four-dimension rows along one grouping and sum the counts.
 *
 * SORTED BY LEADS AND THEN VISITS, descending, with the two tie-breakers after
 * them so the order is TOTAL. An unstable order makes a table flicker between
 * renders and makes two screenshots of the same data disagree, which is how a
 * reader stops trusting a report.
 */
export function groupOriginRows(rows: OriginRow[], grouping: OriginGrouping): OriginGroup[] {
  const byKey = new Map<string, OriginGroup>();

  for (const row of rows) {
    const dims = dimensionsFor(row, grouping);
    const key = [dims.src, dims.code, dims.utm_campaign, dims.attr_ref].map(keyPart).join(KEY_SEP);

    const existing = byKey.get(key);
    if (existing) {
      existing.visits += row.visits;
      existing.leads += row.leads;
      existing.contacted += row.contacted;
      existing.attended += row.attended;
      continue;
    }
    byKey.set(key, {
      key,
      ...dims,
      visits: row.visits,
      leads: row.leads,
      contacted: row.contacted,
      attended: row.attended,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      b.leads - a.leads ||
      b.visits - a.visits ||
      b.attended - a.attended ||
      // Last resort, so the order is total rather than merely mostly-determined.
      a.key.localeCompare(b.key)
  );
}

/** The totals row. Summed from the GROUPS, never recomputed from the raw rows. */
export function totalOrigin(
  groups: OriginGroup[]
): Omit<OriginGroup, 'key' | 'src' | 'code' | 'utm_campaign' | 'attr_ref'> {
  return groups.reduce(
    (acc, g) => ({
      visits: acc.visits + g.visits,
      leads: acc.leads + g.leads,
      contacted: acc.contacted + g.contacted,
      attended: acc.attended + g.attended,
    }),
    { visits: 0, leads: 0, contacted: 0, attended: 0 }
  );
}

/**
 * The date windows the tab offers. `null` days means all time, which is what
 * admin_attribution_summary's p_since IS NULL branch expects.
 */
export const ORIGIN_RANGES = [7, 30, 90, null] as const;
export type OriginRange = (typeof ORIGIN_RANGES)[number];

export function isOriginRange(value: unknown): value is OriginRange {
  return value === null || (typeof value === 'number' && (ORIGIN_RANGES as readonly unknown[]).includes(value));
}

/**
 * The ISO instant a range starts at, or null for all time.
 *
 * Takes `now` as an argument rather than calling Date.now(), so a test can pin it
 * and so this stays a pure function. The windows are rolling from the moment of
 * the request, not calendar-aligned: "last 7 days" in a report an admin refreshes
 * through the day should not jump at midnight Bogotá.
 */
export function originRangeSince(range: OriginRange, now: number): string | null {
  if (range === null) return null;
  return new Date(now - range * 86_400_000).toISOString();
}

/**
 * Show-up rate as a percentage, or null when there is nothing to divide.
 *
 * NULL AND NOT ZERO when leads is 0. A channel with no leads has no show-up rate,
 * and rendering "0%" claims a measurement that was never taken -- the same reason
 * migration 213 returns no signups column rather than a column of zeros. The tab
 * renders a dash for null.
 */
export function showUpRate(group: Pick<OriginGroup, 'leads' | 'attended'>): number | null {
  if (group.leads <= 0) return null;
  return Math.round((group.attended / group.leads) * 100);
}
