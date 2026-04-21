import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
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
    ];
  },
};

/**
 * LR-01: wrap Next config with Sentry so source maps are uploaded at
 * build time and client errors point to the original TS files rather
 * than minified chunks.
 *
 * Activation: set `SENTRY_AUTH_TOKEN` in Vercel (build-time only).
 * Without the token, upload is skipped with a warning but the build
 * still succeeds.
 */
export default withSentryConfig(nextConfig, {
  // Project identifiers — visible in Sentry settings.
  org: process.env.SENTRY_ORG || 'tribe',
  project: process.env.SENTRY_PROJECT || 'tribe-v3',

  // Suppress Sentry SDK build logs unless we're debugging them.
  silent: !process.env.CI,

  // Upload source maps from the client bundle so stack traces in the
  // Sentry dashboard map back to TypeScript source.
  widenClientFileUpload: true,

  // Tunnel Sentry events through /monitoring so ad-blockers don't filter
  // them (ad-blockers commonly block *.sentry.io).
  tunnelRoute: '/monitoring',

  // Strip Sentry logger calls from the client bundle so we don't ship
  // KB of diagnostic strings to users.
  disableLogger: true,

  // Skip the auth-token check when it's not set — lets local `next build`
  // succeed without CI-only secrets.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Pre-launch: avoid Vercel's cron monitoring integration's opinionated
  // defaults. We already log crons via LR-05.
  automaticVercelMonitors: false,
});
