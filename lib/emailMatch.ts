/**
 * Email identity matching for service-role lookups.
 *
 * Several service-role queries resolve *who someone is* by matching an email
 * with `.ilike()` rather than `.eq()`. That is deliberate and must stay:
 * Supabase Auth stores emails lowercased, but coaches type client emails by
 * hand and may enter `John@Gym.com`. `.eq()` is case-sensitive, so swapping it
 * in would silently stop matching those rows — a member would lose access to
 * their own training record and their data export would come back empty.
 *
 * The danger is that `ilike` is a PATTERN match. In SQL LIKE, `_` matches any
 * single character and `%` matches any sequence, and both are legal in an email
 * local-part. Passing a raw address as the pattern therefore matches OTHER
 * people's rows: `a_b@example.com` also matches `axb@example.com`. Because the
 * pattern is the caller's own signup email, this is deliberately exploitable,
 * not merely accidental — an account registered as `_____@example.com` matches
 * every five-character local-part at that domain.
 *
 * So: keep `ilike` for case-insensitivity, escape the metacharacters so the
 * pattern can only ever match one exact address.
 */

/** Lowercase + trim, matching how Supabase Auth stores addresses. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Escape LIKE/ILIKE metacharacters so a value matches literally.
 *
 * Escapes the backslash itself as well as `%` and `_`; a single pass over the
 * string (rather than three chained replaces) avoids re-escaping the
 * backslashes this function just inserted. Backslash is PostgreSQL's default
 * LIKE escape character, so no explicit ESCAPE clause is needed.
 *
 * Use at EVERY identity-scoping `.ilike()`. For genuine search boxes
 * (`%${query}%` over name/title/sport) the wildcards are the point — do not
 * use this there.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
