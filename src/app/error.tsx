"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/i18n/I18nProvider";

/** Route-level error boundary — renders inside the app shell (nav + styles). */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">😵</p>
      <h1 className="text-2xl font-bold">{t("errorBoundary.title")}</h1>
      <p className="text-gray-500 dark:text-gray-400">{t("errorBoundary.body")}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>{t("errorBoundary.tryAgain")}</Button>
        <Button asChild variant="secondary">
          <Link href="/today">{t("errorBoundary.goToToday")}</Link>
        </Button>
      </div>
    </main>
  );
}
