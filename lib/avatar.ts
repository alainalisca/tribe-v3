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

/**
 * Up to two initials for an initials-avatar, or `?` when there is no usable
 * name.
 *
 * Lives here, next to resolveAvatarUrl, because "what do we draw when there is
 * no photo" is the same question. `components/FeaturedInstructorCarousel.tsx`
 * has its own local copy that predates this one and should import this
 * instead -- not changed here because this landed in a security hotfix and a
 * drive-by refactor of an unrelated carousel is not what that change is for.
 * CLAUDE.md's rule about a second copy being the defect applies: this is the
 * shared home, so the next caller imports rather than redeclares.
 */
export function initialsFromName(name: string | null | undefined): string {
  if (typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => [...p][0] ?? '')
    .join('')
    .toUpperCase();
}
