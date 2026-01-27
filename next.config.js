
const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: '/Users/davidpaniagua/Documents/my-project/my-spa', // Adjust to your root
  webpack: (config) => {
    config.resolve.alias['@react-native-async-storage/async-storage'] = '/src/shims/async-storage.ts';
    return config;
}};

module.exports = {
  // ...existing
  eslint: {
    ignoreDuringBuilds: false,  // Skips ESLint on build (fix later)
  },
};