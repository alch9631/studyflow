import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js dev indicator (the floating "N" button, bottom-left) — it
  // only shows in `next dev` and isn't part of StudyFlow.
  devIndicators: false,
  // Allow the dev server to serve its JS chunks + HMR to phones/tablets on the
  // local network (e.g. http://192.168.x.x:3000). Without this, Next.js 403s the
  // /_next/* assets for non-localhost origins, so the page loads but never
  // hydrates — every button (theme toggle, edit, etc.) appears dead on mobile.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local", "*.lan"],
  // pdf-parse + pdfjs are heavy Node-native libs; run them unbundled at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
  experimental: {
    // Allow uploading lecture scripts / study materials via server actions.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
