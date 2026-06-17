"use client";

import { useSyncExternalStore } from "react";
import { resetCalendarToken } from "@/app/settings/actions";
import ConfirmDialog from "./ConfirmDialog";
import CopyButton from "./CopyButton";
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

  return (
    <div className="mt-3">
      {/* The raw feed URL is kept off-screen — it's a private subscribe link.
          Subscribe directly via Apple/Google, or copy it to paste elsewhere. */}
      <div className="flex flex-wrap gap-2">
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
        <CopyButton
          value={webcalUrl}
          label={t("calendarSync.copyLink")}
          variant="ghost"
          size="sm"
        />
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
