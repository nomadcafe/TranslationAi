/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Load ali-oss from node_modules at runtime instead of bundling it; its
  // urllib/proxy-agent chain pulls in vm2/coffee-script, which webpack can't bundle cleanly.
  serverExternalPackages: ['ali-oss'],
};

module.exports = nextConfig;
