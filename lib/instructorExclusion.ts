/**
 * Which accounts must not appear among instructors (T-GYM1, made observable in
 * T-GYM2).
 *
 * A gym account is an ordinary `users` row with `is_instructor = true` -- there
 * is no account_type column -- so nothing about the row itself distinguishes
 * "CrossFit BullBox" from a person. The exclusion has to come from
 * featured_partners, keyed on business_type.
 *
 * WHY THIS IS A SEPARATE PURE FUNCTION
 * From outside the app you cannot tell this filter from the T-PROF1
 * profile-completeness filter: BullBox is missing an avatar, a bio and
 * years_experience, so it is dropped either way and both causes look identical
 * in a browser. That made the only real check "Al opens /instructors and
 * squints" (2026-09-11). Pulling the rule out here turns it into something CI
 * verifies on every commit, with a gym id present and absent.
 */

/** The PostgREST `not.in` list, or null when there is nothing to exclude. */
export function buildExclusionFilter(organizationUserIds: string[] | null | undefined): string | null {
  const ids = (organizationUserIds ?? []).filter((id) => typeof id === 'string' && id.length > 0);
  // `.not('id','in','()')` is a PostgREST syntax error that breaks the whole
  // instructor list. An empty exclusion must add no filter at all -- which was
  // the live state until a gym partner existed.
  if (ids.length === 0) return null;
  return `(${[...new Set(ids)].join(',')})`;
}

/**
 * Apply the exclusion to a set of rows. The live query does this in PostgREST;
 * this mirrors it exactly so the rule can be asserted without a database.
 */
export function excludeOrganizations<T extends { id: string }>(
  rows: T[],
  organizationUserIds: string[] | null | undefined
): T[] {
  const excluded = new Set((organizationUserIds ?? []).filter(Boolean));
  if (excluded.size === 0) return rows;
  return rows.filter((row) => !excluded.has(row.id));
}
