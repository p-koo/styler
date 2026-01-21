import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["chromadb", "pdf-parse"],
  devIndicators: false,
  output: "standalone",
};

export default nextConfig;
