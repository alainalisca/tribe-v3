import type { NextConfig } from 'next';

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
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://us.i.posthog.com https://us-assets.i.posthog.com https://vercel.live https://unpkg.com https://maps.googleapis.com",
              "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com",
              "img-src 'self' https: data: blob:",
              "font-src 'self' data: https://fonts.gstatic.com https://vercel.live",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://maps.googleapis.com https://fcm.googleapis.com https://vercel.live https://fonts.googleapis.com https://fonts.gstatic.com https://images.unsplash.com https://*.tile.openstreetmap.org https://unpkg.com",
              "frame-src 'self' https://vercel.live",
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
        ],
      },
    ];
  },
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

export default nextConfig;
