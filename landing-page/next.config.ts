import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["tendentiously-impalpable-dede.ngrok-free.dev"],
  productionBrowserSourceMaps: false,
  experimental: {
    webpackBuildWorker: true,
    webpackMemoryOptimizations: true,
  },
};

export default nextConfig;
