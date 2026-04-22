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

export default nextConfig;
