/**
 * T-JOIN1 Part C. Whether an avatar URL may be drawn at all. A trust rule, not
 * a loader: a stock photo from Unsplash is not the person, so it renders the
 * initials block like no photo would. Empty, relative-garbage and non-http(s)
 * values are null too. A URL that is fine here but fails to load is the
 * component's job (UserAvatar, AvatarImage): they fall back on error.
 */
const STOCK_HOSTS = /(^|\.)unsplash\.com$/i;

export function usableAvatarUrl(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (STOCK_HOSTS.test(parsed.hostname)) return null;
  return raw;
}

/** Up to two initials, uppercased in Spanish ("ana gómez" -> "AG"); "?" when there is no name. */
export function avatarInitials(name: string | null | undefined): string {
  const letters = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => Array.from(w)[0]?.toLocaleUpperCase('es') ?? '')
    .join('');
  return letters || '?';
}
