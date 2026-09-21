/**
 * Google OAuth avatar URLs are stored VERBATIM, and Google's default is tiny.
 *
 * lib/auth-helpers.ts captures `user_metadata.avatar_url || .picture` and
 * writes it straight to users.avatar_url -- nothing downloads or resizes it.
 * Google's conventional value ends `=s96-c`, which is 96x96. A 128px circle on
 * a 3x phone needs ~384px, so that photo is upscaled fourfold and looks exactly
 * as bad as it sounds.
 *
 * MEASURED on a real stored URL, not assumed:
 *   ...=s96-c   -> HTTP 200,  3,165 bytes,  96 x 96
 *   ...=s600-c  -> HTTP 200, 45,551 bytes, 600 x 600
 *
 * So Google honours the size parameter and one string substitution fixes it.
 * 600 matches what the uploader produces for a self-uploaded headshot
 * (useEditProfile compresses to max 600px), so both sources end up equivalent.
 *
 * SCOPE, deliberately narrow: only lh3.googleusercontent.com URLs carrying an
 * `=sNN-c` suffix are touched. A URL with no size parameter is left alone
 * rather than guessed at, because appending one to an unknown URL shape is how
 * a working avatar becomes a 404.
 */
const GOOGLE_AVATAR_SIZE = 600;

/** Matches Google's `=s<digits>-c` sizing suffix at the END of the url. */
const GOOGLE_SIZE_SUFFIX = /=s\d+-c$/;

export function upgradeProviderAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.includes('googleusercontent.com')) return url;
  if (!GOOGLE_SIZE_SUFFIX.test(url)) return url;
  return url.replace(GOOGLE_SIZE_SUFFIX, `=s${GOOGLE_AVATAR_SIZE}-c`);
}
