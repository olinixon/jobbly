import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@googleapis/sheets', 'google-auth-library'],
};

export default nextConfig;
