import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["chromadb", "pdf-parse"],
  devIndicators: false,
};

export default nextConfig;
