/**
 * Utilities for comma-separated list fields.
 *
 * Pattern: keep raw string in local state while editing (so the user can type
 * commas freely), then call parseCommaList only at save/blur time.
 */

/** Split a raw comma-separated string into a trimmed, non-empty array. */
export function parseCommaList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Format an array back to a display string for a comma-list input. */
export function formatCommaList(items: string[]): string {
  return items.join(', ');
}
