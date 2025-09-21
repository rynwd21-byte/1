/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  swcMinify: true,
  experimental: { esmExternals: 'loose' },
  transpilePackages: ['papaparse']
};
export default nextConfig;
