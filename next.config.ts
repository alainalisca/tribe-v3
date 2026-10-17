import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';
import { PLANES_PAGE, planesGuardError } from './lib/site/planesGuard';

// T-SITE1: the coach-plans flag cannot go on before T-PLAN1's /planes page exists.
const planesGuard = planesGuardError(process.env.COACH_PLANS_ENABLED, existsSync(join(process.cwd(), PLANES_PAGE)));
if (planesGuard) throw new Error(planesGuard);

const nextConfig: NextConfig = {
  /**
   * Apple requires the AASA to be served as application/json. It has NO file
   * extension, by Apple's own rule, so Next has nothing to infer the type
   * from and serves it as a generic binary -- which Apple rejects, silently.
   *
   * It must also be served with no redirect, which is why /.well-known is
   * exempted in middleware.ts.
   */
  async headers() {
    return [
      {
        source: '/.well-known/apple-app-site-association',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
      },
    ];
  },

  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
  // T-ANALYTICS1 part C: the build's short commit SHA, inlined into the client
  // bundle as PostHog's `app_version` super property. VERCEL_GIT_COMMIT_SHA is
  // set at build time on every Vercel deployment; a local build reports 'local'.
  env: {
    NEXT_PUBLIC_APP_VERSION: (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7),
  },
  trailingSlash: true,
  // Security headers (CSP, HSTS, X-Frame-Options, etc.) live in middleware.ts
  // so every response goes through one codepath. See middleware.ts docblock.
  async redirects() {
    return [
      {
        source: '/my-sessions',
        destination: '/sessions',
        permanent: true,
      },
      // T-SITE1: the old marketing pages, replaced by the Jornada site. 301 (not
      // Next's default 308) because that is what the spec and old crawlers
      // expect. `{/}?` matches with and without the trailing slash.
      { source: '/for-instructors{/}?', destination: '/coaches/', statusCode: 301 },
      { source: '/faq{/}?', destination: '/preguntas/', statusCode: 301 },
      { source: '/about{/}?', destination: '/#manifiesto', statusCode: 301 },
    ];
  },
  async rewrites() {
    return [
      // Next.js does not serve public/<dir>/index.html at the directory path,
      // so the static app-download page 404s at /download without this.
      // Middleware lists /download as a public path; keep the two in sync.
      {
        source: '/download',
        destination: '/download/index.html',
      },
      // T-ANALYTICS1 part E: first-party reverse proxy for PostHog, so ad
      // blockers that drop requests to *.posthog.com do not drop Tribe's
      // analytics. Order matters: the two asset rules must come before the
      // catch-all. /ingest/array serves remote config (array/<token>/config):
      // with a proxied api_host the SDK routes assets through it too
      // (requestRouter.endpointFor('assets'), verified in 1.434.14).
      //
      // Middleware lists /ingest as a public path; keep the two in sync. No
      // skipTrailingSlashRedirect: it would turn off trailing-slash redirects
      // for the whole site (decision 8); the preview was checked with curl.
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/array/:path*',
        destination: 'https://us-assets.i.posthog.com/array/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
};

export default nextConfig;
