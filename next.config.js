/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the legacy HTML app accessible at /atica_app.html
  // It lives in /public/ now
  async rewrites() {
    return [
      // Legacy API path → new Next.js API route
      {
        source: '/api/shopify/:path*',
        destination: '/api/shopify/:path*',
      },
    ];
  },
  // Allow Shopify image domains
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'aticaman.com' },
      { protocol: 'https', hostname: 'cdn.shopify.com' },
      { protocol: 'https', hostname: '*.myshopify.com' },
    ],
  },
};

module.exports = nextConfig;
