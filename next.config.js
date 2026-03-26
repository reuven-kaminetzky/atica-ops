/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone for Netlify
  output: 'standalone',
  
  // Ignore legacy files during Next.js build
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/lib': require('path').resolve(__dirname, 'lib'),
    };
    return config;
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_SHOPIFY_STORE: process.env.SHOPIFY_STORE_URL,
  },
};

module.exports = nextConfig;
