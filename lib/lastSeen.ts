/**
 * ADMIN-01: `last_login_at` as a short relative label.
 *
 * The admin list already fetched this column on every load and threw it away.
 * It is the single best "is this account real" signal available without a new
 * query, and the case that matters most is the null one: an account that has
 * NEVER logged in must read as `never`, not as an enormous number of days since
 * the epoch, and not as a blank cell that looks like a rendering bug.
 */
export function lastSeenLabel(iso: string | null | undefined, language: string, now: number = Date.now()): string {
  if (!iso) return language === 'es' ? 'nunca' : 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return language === 'es' ? 'nunca' : 'never';

  const mins = Math.floor((now - then) / 60000);
  // A clock skew or a just-written timestamp can land slightly in the future.
  // Report that as "now" rather than a negative age.
  if (mins < 1) return language === 'es' ? 'ahora' : 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 365) return `${days}d`;
  return `${Math.floor(days / 365)}y`;
}
