/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Keep server external packages out of the bundler (Prisma needs this)
    serverExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

export default nextConfig;
