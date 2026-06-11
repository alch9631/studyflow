"use client";

import { applyMode, THEME_OPTIONS, useThemeMode } from "./lib/theme";
import { useT } from "./i18n/I18nProvider";

/** Light / Dark / System theme selector. Persists to localStorage. */
export default function ThemeSetting() {
  const mode = useThemeMode();
  const t = useT();

  return (
    <div className="inline-flex rounded-xl border border-gray-200 p-1 dark:border-gray-800">
      {THEME_OPTIONS.map((o) => {
        const active = mode === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={active}
            onClick={() => applyMode(o.v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-brand text-brand-foreground"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            <span>{o.icon}</span>
            {t(`theme.${o.v}`)}
          </button>
        );
      })}
    </div>
  );
}
