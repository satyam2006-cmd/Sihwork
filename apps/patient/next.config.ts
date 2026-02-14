import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@second-opinion/shared"],
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
