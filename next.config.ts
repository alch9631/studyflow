import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse + pdfjs are heavy Node-native libs; run them unbundled at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  experimental: {
    // Allow uploading lecture scripts / study materials via server actions.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
