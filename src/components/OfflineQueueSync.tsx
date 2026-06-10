"use client";

import { useEffect } from "react";
import { useToast } from "./Toast";
import { useT } from "./i18n/I18nProvider";
import {
  setReplayErrorHandler,
  startAutoReplay,
} from "./lib/actionQueue";

/**
 * Headless companion to the offline action queue (src/components/lib/actionQueue).
 *
 * Mounted once in the root layout (inside <ToastProvider>), it:
 *   - replays any toggles queued while offline the moment the browser fires
 *     `online` (and once on mount if we reconnected before this loaded), and
 *   - surfaces a toast if a queued replay genuinely fails on reconnect, so a
 *     dropped change is never silent.
 *
 * Renders nothing.
 */
export default function OfflineQueueSync() {
  const { toast } = useToast();
  const t = useT();

  useEffect(() => {
    setReplayErrorHandler(() => toast(t("offlineSync.syncError"), "error"));
    const stop = startAutoReplay();
    return () => {
      setReplayErrorHandler(null);
      stop();
    };
  }, [toast, t]);

  return null;
}
