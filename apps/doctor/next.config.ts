import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  transpilePackages: ["@second-opinion/shared"],
  serverExternalPackages: ["@anthropic-ai/sdk"],
};

export default nextConfig;
