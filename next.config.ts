import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle (.next/standalone) — lets us ship a small
  // Docker image and run `node server.js` on any host (Fly/Render/VPS), not just
  // the Pi. Additive: `next start` still works locally/on the Pi.
  output: "standalone",
  // Hide the Next.js dev indicator (the floating "N" button, bottom-left) — it
  // only shows in `next dev` and isn't part of StudyFlow.
  devIndicators: false,
  // Allow the dev server to serve its JS chunks + HMR to phones/tablets on the
  // local network (e.g. http://192.168.x.x:3000). Without this, Next.js 403s the
  // /_next/* assets for non-localhost origins, so the page loads but never
  // hydrates — every button (theme toggle, edit, etc.) appears dead on mobile.
  // 100.*.* covers Tailscale's 100.64.0.0/10 range (reach the dev server from a
  // phone over Tailscale); the rest cover the local LAN.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "100.*.*.*", "*.local", "*.lan", "*.ts.net", "*.*.ts.net"],
  // pdf-parse + pdfjs are heavy Node-native libs; run them unbundled at runtime.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
  experimental: {
    serverActions: {
      // Allow uploading lecture scripts / study materials via server actions.
      bodySizeLimit: "20mb",
      // Behind Prisma Compute's reverse proxy the forwarded Host differs from
      // the request Origin, so Next.js's Server Action origin check would reject
      // every POST action (the page loads on GET, but "Add modules" etc. just
      // freezes). Trust the deploy domains so server actions run.
      allowedOrigins: [
        "*.prisma.build",
        "cmqjr82wb09th0ddxa6xzwvqa.fra.prisma.build",
        "*.ts.net",
      ],
    },
  },
};

export default nextConfig;
