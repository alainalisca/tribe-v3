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
  async rewrites() {
    return [
      // Next.js does not serve public/<dir>/index.html at the directory path,
      // so the static app-download page 404s at /download without this.
      // Middleware lists /download as a public path; keep the two in sync.
      {
        source: '/download',
        destination: '/download/index.html',
      },
    ];
  },
};

export default nextConfig;
