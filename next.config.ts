import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable server actions for file uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
};

export default nextConfig;
