"use client";

import { useState, useSyncExternalStore } from "react";
import { resetCalendarToken } from "@/app/settings/actions";
import ToastForm from "./ToastForm";

// Read window origin without a hydration mismatch: server snapshot is "" so SSR
// and the first client render agree, then it syncs to the real origin.
const subscribeNoop = () => () => {};

/**
 * Shows the live calendar subscribe URL for the user's plan, with Copy and
 * "Add to calendar" actions. The host is read from the browser so the URL is
 * correct whether on localhost, LAN/Tailscale, or a deployed domain.
 */
export default function CalendarSync({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
  const host = origin.replace(/^https?:\/\//, "");
  const path = `/api/calendar/${token}`;
  const webcalUrl = host ? `webcal://${host}${path}` : "";
  const displayUrl = host ? `webcal://${host}${path}` : "Loading…";

  async function copy() {
    if (!webcalUrl) return;
    try {
      await navigator.clipboard.writeText(webcalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API blocked (e.g. insecure context) — user can copy manually.
    }
  }

  return (
    <div className="mt-3">
      <code className="block overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
        {displayUrl}
      </code>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          disabled={!webcalUrl}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
        <a
          href={webcalUrl || undefined}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Add to calendar
        </a>
        <ToastForm
          action={resetCalendarToken}
          successMessage="Calendar link reset — the old link no longer updates."
          errorMessage="Couldn't reset the calendar link — please try again."
          onSubmit={(e) => {
            if (!confirm("Reset the calendar link? Anyone using the old link will stop getting updates.")) {
              e.preventDefault();
            }
          }}
        >
          <button
            type="submit"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            Reset link
          </button>
        </ToastForm>
      </div>
    </div>
  );
}
