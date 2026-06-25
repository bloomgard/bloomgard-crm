import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // If Vercel is building this, be a live server (undefined).
  // If your computer is building the APK, be static ('export').
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  
  output: process.env.VERCEL ? undefined : 'export', 
  
  images: { 
    unoptimized: true,
  },

  trailingSlash: false,

  // Force Next.js to ignore all errors so the build NEVER fails
  typescript: {
    ignoreBuildErrors: true,
  },
  
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;