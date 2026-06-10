"use client";

import { useState, useSyncExternalStore } from "react";
import { resetCalendarToken } from "@/app/settings/actions";
import ConfirmDialog from "./ConfirmDialog";
import { Button } from "./ui/button";
import { useT } from "./i18n/I18nProvider";

// Read window origin without a hydration mismatch: server snapshot is "" so SSR
// and the first client render agree, then it syncs to the real origin.
const subscribeNoop = () => () => {};

/**
 * Live calendar subscribe controls for the user's plan. Offers one-tap subscribe
 * for Apple and Google Calendar plus a copy-link fallback, all pointing at the
 * same auto-updating feed. The host is read from the browser so the URL is
 * correct whether on localhost, LAN/Tailscale, or a deployed domain.
 */
export default function CalendarSync({ token }: { token: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const origin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
  const host = origin.replace(/^https?:\/\//, "");
  const path = `/api/calendar/${token}`;
  // webcal:// is the canonical "subscribe" URL — Apple Calendar opens it
  // directly, and it's what we copy/show as the portable link.
  const webcalUrl = host ? `webcal://${host}${path}` : "";
  // Google Calendar subscribes via its add-by-URL deep link; it fetches the
  // feed server-side over http(s), so hand it the origin-scheme URL.
  const googleUrl = origin
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(`${origin}${path}`)}`
    : "";
  const displayUrl = host ? webcalUrl : t("common.loading");

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
        {webcalUrl ? (
          <Button asChild size="sm">
            <a href={webcalUrl}>Apple Calendar</a>
          </Button>
        ) : (
          <Button type="button" size="sm" disabled>
            Apple Calendar
          </Button>
        )}
        {googleUrl ? (
          <Button asChild variant="secondary" size="sm">
            <a
              href={googleUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("calendarSync.googleAriaLabel")}
            >
              Google Calendar
            </a>
          </Button>
        ) : (
          <Button type="button" variant="secondary" size="sm" disabled>
            Google Calendar
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={copy}
          disabled={!webcalUrl}
        >
          {copied ? t("calendarSync.copied") : t("calendarSync.copyLink")}
        </Button>
        <ConfirmDialog
          action={resetCalendarToken}
          successMessage={t("calendarSync.resetSuccess")}
          errorMessage={t("calendarSync.resetError")}
          triggerLabel={t("calendarSync.resetLink")}
          triggerVariant="ghost"
          triggerSize="sm"
          title={t("calendarSync.resetConfirmTitle")}
          message={t("calendarSync.resetConfirmMessage")}
          confirmLabel={t("calendarSync.resetConfirm")}
          pendingLabel={t("calendarSync.resetting")}
          cancelLabel={t("common.cancel")}
        />
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {t("calendarSync.syncHint")}
      </p>
    </div>
  );
}
