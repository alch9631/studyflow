import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the file-tracing root to THIS project. Next otherwise infers it by
  // walking up for lockfiles, so any extra one above or inside the repo (a
  // stray ~/package-lock.json, or a git worktree under .claude/worktrees) moves
  // the root up — which nests the standalone output at
  // `.next/standalone/<rel>/<path>/server.js` instead of
  // `.next/standalone/server.js`. The systemd unit and the Dockerfile both exec
  // the latter, so an unpinned root silently ships a bundle whose entrypoint
  // isn't where the runtime looks and the service restart-loops on
  // MODULE_NOT_FOUND (this took the Pi down once). Pinning makes the output
  // path deterministic regardless of what else is on disk at build time.
  outputFileTracingRoot: __dirname,
  // Self-contained server bundle (.next/standalone) — lets us ship a small
  // Docker image and run `node server.js` on any host (Fly/Render/VPS), not just
  // the Pi. Additive: `next start` still works locally/on the Pi.
  output: "standalone",
  // Don't advertise the framework/version in prod responses. Removes the
  // `X-Powered-By: Next.js` header (harmless but a needless fingerprinting hint).
  poweredByHeader: false,
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
    // Allow uploading lecture scripts / study materials via server actions.
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
