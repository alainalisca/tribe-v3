/**
 * Lightweight UUID v4 / v7 shape check.
 *
 * Used by route-level pages that take an `[id]` dynamic segment to
 * short-circuit before hitting Postgres. Without this guard, a
 * URL like `/os/clients/edit` (or any path the user types into the
 * address bar) reaches the database, which rejects it with a raw
 * "invalid input syntax for type uuid" error that surfaces to the
 * user as a confusing error state.
 *
 * This is intentionally a shape-only check — it doesn't verify the
 * UUID version bits or the variant nibble. Postgres's `uuid` type
 * accepts any of those; we just need to avoid sending non-UUID
 * strings.
 *
 * 8-4-4-4-12 hex pattern, case-insensitive.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}
