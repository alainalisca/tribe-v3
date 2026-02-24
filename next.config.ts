import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true
  },
  trailingSlash: true,
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
