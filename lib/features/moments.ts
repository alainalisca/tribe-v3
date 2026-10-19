/**
 * T-MOM1: MOMENTS_ENABLED, the server-side flag for the whole Moments UI
 * (upload and tagging, delivery, the claim link, sharing, the coach page
 * strip, "Registrar sesión pasada"). Off means nothing of it renders and its
 * routes answer 404; the data stays.
 *
 *   "true" / "false"  as set
 *   unset             on in Preview deployments and local development, off in
 *                     Production (Al turns it on there when the privacy line
 *                     is published).
 *
 * Server-side only: never NEXT_PUBLIC, so the browser bundle cannot flip it.
 * Part F (open posting, video) has its own MOMENTS_POSTS_ENABLED and is not
 * read here.
 */
export function isMomentsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.MOMENTS_ENABLED === 'true') return true;
  if (env.MOMENTS_ENABLED === 'false') return false;
  return env.VERCEL_ENV === 'preview' || (!env.VERCEL_ENV && env.NODE_ENV === 'development');
}

/**
 * The Moments pages, for middleware: while the flag is off each is a real 404
 * for everyone, signed in or not, rather than a sign-in redirect that would
 * say the page exists. Pure and edge-safe.
 */
export function isMomentsPagePath(pathname: string): boolean {
  return (
    /^\/(?:profile\/momentos|m\/[^/]+|fotos\/registrar-sesion)(?:\/|$)/.test(pathname) ||
    /^\/session\/[^/]+\/fotos(?:\/|$)/.test(pathname)
  );
}
