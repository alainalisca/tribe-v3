/**
 * Resolve which image to show as a user's avatar.
 *
 * A user can have a dedicated avatar (headshot) in `users.avatar_url` AND a
 * separate gallery in `users.photos`. The public profile page already falls
 * back to the first gallery photo when no headshot is set, but other surfaces
 * (Browse Instructors, home featured instructors) read `avatar_url` directly
 * and showed a letter placeholder for users who only uploaded gallery photos.
 * This helper makes the fallback consistent: prefer the headshot, otherwise
 * use the first gallery photo, otherwise null (caller shows initials).
 */
export function resolveAvatarUrl(
  avatarUrl: string | null | undefined,
  photos: string[] | null | undefined
): string | null {
  if (typeof avatarUrl === 'string' && avatarUrl.trim()) return avatarUrl;
  if (Array.isArray(photos)) {
    const first = photos.find((p) => typeof p === 'string' && p.trim());
    if (first) return first;
  }
  return null;
}
