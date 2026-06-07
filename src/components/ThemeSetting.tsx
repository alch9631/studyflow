"use client";

import { useSyncExternalStore } from "react";

type Mode = "light" | "dark" | "system";

// Same localStorage key the no-flash script in layout.tsx reads:
//   'light' | 'dark' => explicit;  absent => follow system preference.
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

function applyMode(mode: Mode) {
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

const OPTIONS: { v: Mode; label: string; icon: string }[] = [
  { v: "light", label: "Light", icon: "☀️" },
  { v: "dark", label: "Dark", icon: "🌙" },
  { v: "system", label: "System", icon: "🖥️" },
];

/** Light / Dark / System theme selector. Persists to localStorage. */
export default function ThemeSetting() {
  const mode = useSyncExternalStore(subscribe, getMode, () => "system" as Mode);

  return (
    <div className="inline-flex rounded-xl border border-gray-200 p-1 dark:border-gray-800">
      {OPTIONS.map((o) => {
        const active = mode === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={active}
            onClick={() => applyMode(o.v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-brand text-white"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            <span>{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
