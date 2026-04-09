/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Required for better-sqlite3 native module in production
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), 'better-sqlite3'];
    }
    return config;
  },
};
module.exports = nextConfig;
