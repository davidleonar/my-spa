const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '/'),  // Project root; adjust if monorepo
  env: {
    // Copy from next.config.ts
    NEXT_PUBLIC_FIREBASE_API_KEY: "AIzaSyBk_fTMgmkwZGoW154ntCxxXwiDMy5o7KA",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "rendimientos-5dbb9.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_DB_URL: "https://rendimientos-5dbb9-default-rtdb.firebaseio.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "rendimientos-5dbb9",
    NEXT_PUBLIC_FIREBASE_STRG_BUCKET: "rendimientos-5dbb9.firebasestorage.app",
    NEXT_PUBLIC_FIREBASE_MSID: "698366956468",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:698366956468:web:18ae8758f5f3c4fe5dd8e1",
    NEXT_PUBLIC_FIREBASE_MSM_ID: "G-Y5QKXN0N6C",
  },
  async headers() {
    // Copy from next.config.ts
    if (process.env.NODE_ENV === 'development') {
      return [
        { source: '/_next/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] },
      ];
    }
    return [];
  },
  experimental: {
    // Copy from next.config.ts
  },
  images: {
    minimumCacheTTL: 31536000, // 1 year
  },
  webpack: (config) => {
    // Copy alias from next.config.js
    config.resolve.alias['@react-native-async-storage/async-storage'] = path.join(__dirname, 'src/shims/async-storage.ts');
    return config;
  },
  eslint: {
    ignoreDuringBuilds: false,  // From next.config.js; set true temporarily if linting blocks
  },
};

module.exports = nextConfig;