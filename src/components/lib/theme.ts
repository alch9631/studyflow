"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared client-side theme state. The persisted preference lives in the same
 * `localStorage` key the no-flash script in layout.tsx reads:
 *   'light' | 'dark' => explicit;  absent => follow the system preference.
 *
 * Centralising this here lets every theme affordance (the Settings page's
 * segmented control and the header's quick-switch menu) stay in lockstep — they
 * all read from and write to the same source of truth and re-render together.
 */

export type Mode = "light" | "dark" | "system";

export const THEME_OPTIONS: { v: Mode; label: string; icon: string }[] = [
  { v: "light", label: "Light", icon: "☀️" },
  { v: "dark", label: "Dark", icon: "🌙" },
  { v: "system", label: "System", icon: "🖥️" },
];

function subscribe(cb: () => void) {
  window.addEventListener("themechange", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("themechange", cb);
    window.removeEventListener("storage", cb);
  };
}

function getMode(): Mode {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return "system";
}

/** Apply a theme mode: persist it, flip `.dark` on <html>, and notify subscribers. */
export function applyMode(mode: Mode) {
  try {
    if (mode === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", mode);
  } catch {}
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event("themechange"));
}

/** Subscribe to the current theme mode. Server snapshot is "system". */
export function useThemeMode(): Mode {
  return useSyncExternalStore(subscribe, getMode, () => "system" as Mode);
}
