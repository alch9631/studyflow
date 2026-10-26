"use client";

import { useLinkStatus } from "next/link";
import { useT } from "./i18n/I18nProvider";

/** Immediate feedback when a primary tab's prefetch has not finished yet. */
export default function NavigationPending() {
  const { pending } = useLinkStatus();
  const t = useT();

  return (
    <>
      <span
        aria-hidden="true"
        data-pending={pending || undefined}
        className={`pointer-events-none absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-current ${pending ? "opacity-60 motion-safe:animate-pulse" : "opacity-0"}`}
      />
      <span role="status" className="sr-only">{pending ? t("nav.opening") : ""}</span>
    </>
  );
}
