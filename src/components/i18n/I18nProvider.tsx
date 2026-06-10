"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createTranslator,
  LOCALE_COOKIE,
  type Locale,
  type Translator,
} from "./messages";

/**
 * Client-side locale context. Seeded by the root layout with the server-resolved
 * locale (so the first client render matches the server, no hydration flash).
 *
 * Switching locale writes the persisting cookie, updates local state for an
 * instant client re-render, and calls `router.refresh()` so server components
 * re-render reading the new cookie. The messages themselves are imported
 * directly (never serialized) — only the locale string lives in context.
 */

type I18nContextValue = {
  locale: Locale;
  t: Translator;
  setLocale: (locale: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      if (typeof document !== "undefined") {
        // 1 year, root path, lax — readable by the server on the next request.
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
        document.documentElement.lang = next;
      }
      setLocaleState(next);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, t: createTranslator(locale), setLocale }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

/** The active locale on the client. */
export function useLocale(): Locale {
  return useI18n().locale;
}

/** The client-side translator bound to the active locale. */
export function useT(): Translator {
  return useI18n().t;
}

/** Switch locale (persists + refreshes server components). */
export function useSetLocale(): (locale: Locale) => void {
  return useI18n().setLocale;
}
