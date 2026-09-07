import process from "node:process";

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // AI requests can use the provider's full two-minute response window.
  experimental: { proxyTimeout: 150000 },
  transpilePackages: ["backend"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.BACKEND_URL ?? "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
