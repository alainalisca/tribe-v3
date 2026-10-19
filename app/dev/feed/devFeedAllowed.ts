/**
 * /dev/feed opens in local development only: never in a production build and
 * never on a Vercel deployment (VERCEL_ENV is set on previews and production).
 */
export function devFeedAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production' && !env.VERCEL_ENV;
}
