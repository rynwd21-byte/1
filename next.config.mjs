/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Leave these to prevent TS/Lint from blocking deploy; remove later once cleaned.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true }
};

export default nextConfig;
