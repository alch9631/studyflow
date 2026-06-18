"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { iconButtonClass } from "./ui";
import { useT } from "./i18n/I18nProvider";

/** Subscribe to changes of the `.dark` class on <html>. */
function subscribe(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => obs.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

/** Night-mode toggle: flips `.dark` on <html> and remembers the choice. */
export default function ThemeToggle() {
  const t = useT();
  // Reads the real DOM state (set pre-paint by the no-flash script in layout)
  // without setState-in-effect; the server snapshot is "light".
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  function toggle() {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={t("theme.toggleNightMode")}
      title={t("theme.toggleNightMode")}
      className={iconButtonClass(
        "inline-flex border border-gray-300 hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800",
      )}
    >
      {dark ? (
        <Sun className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Moon className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
