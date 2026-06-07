import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StudyFlow",
    short_name: "StudyFlow",
    description: "The study plan that builds itself — and heals itself when you fall behind.",
    start_url: "/today",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#00509b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
