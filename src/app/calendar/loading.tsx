"use client";

import { useT } from "@/components/i18n/I18nProvider";

export default function Loading() {
  const t = useT();
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6">
      <h1 className="text-lg font-bold tracking-tight">{t("calendar.title")}</h1>
      <div aria-hidden="true" className="mt-4 space-y-4 motion-safe:animate-pulse">
        <div className="flex gap-2">
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="h-14 min-w-0 flex-1 rounded-xl bg-surface-muted" />
          ))}
        </div>
        <div className="h-24 rounded-xl bg-surface-muted" />
        <div className="h-40 rounded-xl bg-surface-muted" />
      </div>
    </main>
  );
}
