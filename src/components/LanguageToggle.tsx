"use client";

import { LOCALES, type Locale } from "./i18n/messages";
import { useLocale, useSetLocale, useT } from "./i18n/I18nProvider";

/**
 * DE / EN language selector. Mirrors the ThemeSetting segmented control so the
 * two preferences read the same. The choice persists (cookie) and re-renders the
 * whole app — server components included — in the new language.
 */
export default function LanguageToggle() {
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useT();

  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="inline-flex rounded-xl border border-gray-200 p-1 dark:border-gray-800"
    >
      {LOCALES.map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(l as Locale)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium uppercase transition-colors ${
              active
                ? "bg-brand text-brand-foreground"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}
