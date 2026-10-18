import { CANONICAL_SITE_URL } from './siteUrl';

/**
 * T-SHARE1. The origin a share card's og:image and twitter:image are named on.
 *
 * Production: tribelatam.com, like every canonical. A Vercel PREVIEW: its own
 * host, so a preview link pasted into WhatsApp shows that preview's card
 * (tribelatam.com would serve production's, or nothing for a page that only
 * exists on the branch). VERCEL_BRANCH_URL first, since it stays the same for
 * every push to a branch; VERCEL_URL (this one deployment) if it is missing.
 * Both are set by Vercel at build and run time; anywhere else, tribelatam.com.
 *
 * Only images: og:url and canonicals stay on tribelatam.com everywhere.
 */
export function shareImageOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === 'preview') {
    const host = (env.VERCEL_BRANCH_URL || env.VERCEL_URL || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (host) return `https://${host}`;
  }
  return CANONICAL_SITE_URL;
}
