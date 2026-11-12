/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // ali-oss is a Node-only SDK; load it from node_modules at runtime instead of bundling it.
  serverExternalPackages: ['ali-oss'],
};

module.exports = nextConfig;
