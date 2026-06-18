"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CloudRain } from "lucide-react";
import { Button } from "./ui/button";
import { mutedCardClass } from "./ui";
import { useT } from "./i18n/I18nProvider";
import type { MessageKey } from "./i18n/messages";

/**
 * Shared, calm route-level error UI. Every segment's `error.tsx` renders this
 * inside the app shell (nav + styles), so the copy stays reassuring and the
 * styling stays soft — no scary red, no "Something went wrong".
 *
 * `variant` picks context-appropriate copy (planning / import / data) but the
 * default is a sensible, honest fallback. We only promise what we can deliver:
 * the user's saved data is safe, and "Try again" re-runs the failed render.
 */

export type CalmErrorVariant = "default" | "planning" | "import" | "data";

/** Per-variant title/body message keys (all under the `error.*` namespace). */
const VARIANT_KEYS: Record<
  CalmErrorVariant,
  { title: MessageKey; body: MessageKey }
> = {
  default: { title: "error.default.title", body: "error.default.body" },
  planning: { title: "error.planning.title", body: "error.planning.body" },
  import: { title: "error.import.title", body: "error.import.body" },
  data: { title: "error.data.title", body: "error.data.body" },
};

export default function CalmError({
  error,
  reset,
  variant = "default",
}: {
  error: Error & { digest?: string };
  reset: () => void;
  variant?: CalmErrorVariant;
}) {
  // Surface the error to logs/monitoring; we don't show details to the user.
  useEffect(() => {
    console.error(error);
  }, [error]);

  const t = useT();
  const keys = VARIANT_KEYS[variant];

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
      <div className={`${mutedCardClass} w-full p-6`}>
        <p className="flex justify-center text-gray-400 dark:text-gray-500" aria-hidden="true">
          <CloudRain className="h-8 w-8" />
        </p>
        <h1 className="mt-2 text-xl font-semibold">{t(keys.title)}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t(keys.body)}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>{t("error.tryAgain")}</Button>
          <Button asChild variant="secondary">
            <Link href="/today">{t("error.backToToday")}</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
