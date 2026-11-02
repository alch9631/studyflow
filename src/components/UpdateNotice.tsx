"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { RefreshCw } from "lucide-react";
import { useT } from "./i18n/I18nProvider";
import { unsyncedCount, subscribe } from "./lib/actionQueue";

/** Offer a full reload; never interrupt a running session or discard queued work. */
export default function UpdateNotice({ buildId }: { buildId: string | null }) {
  const t = useT();
  // A server refresh may send a newer prop while this tab still runs old JS.
  const [loadedBuildId] = useState(buildId);
  const [available, setAvailable] = useState(false);
  const [online, setOnline] = useState(true);
  const queued = useSyncExternalStore(subscribe, unsyncedCount, () => 0);

  useEffect(() => {
    if (!loadedBuildId || process.env.NODE_ENV !== "production") return;
    let request: AbortController | undefined;
    let stopped = false;
    const check = async () => {
      setOnline(navigator.onLine);
      if (!navigator.onLine || document.visibilityState === "hidden" || request) return;
      request = new AbortController();
      const timeout = window.setTimeout(() => request?.abort(), 5000);
      try {
        const response = await fetch("/api/version", { cache: "no-store", signal: request.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (!stopped && typeof data.buildId === "string" && data.buildId !== loadedBuildId) setAvailable(true);
      } catch {
        // Offline, a deployment restart, or an older server: check again later.
      } finally {
        window.clearTimeout(timeout);
        request = undefined;
      }
    };
    const offline = () => setOnline(false);
    void check();
    const interval = window.setInterval(check, 60_000);
    window.addEventListener("online", check);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      request?.abort();
      window.removeEventListener("online", check);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [loadedBuildId]);

  if (!available) return null;

  return (
    <div role="status" className="border-b border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <p className="min-w-0 text-sm">{queued > 0 || !online ? t("updates.syncFirst") : t("updates.available")}</p>
        <button
          type="button"
          disabled={queued > 0 || !online}
          onClick={() => {
            if (navigator.onLine && unsyncedCount() === 0) window.location.reload();
          }}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-medium underline underline-offset-4 hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-50 dark:hover:bg-gray-800"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t("updates.refresh")}
        </button>
      </div>
    </div>
  );
}
