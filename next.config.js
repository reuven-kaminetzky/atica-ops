/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack (Next.js 16 default)
  turbopack: {},

  // Environment variables
  env: {
    NEXT_PUBLIC_SHOPIFY_STORE: process.env.SHOPIFY_STORE_URL,
  },
};

module.exports = nextConfig;
