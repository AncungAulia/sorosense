import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Wrap route navigations in the browser View Transitions API so pages can
    // slide directionally (styled in globals.css via ::view-transition-*).
    viewTransition: true,
  },
};

export default nextConfig;
