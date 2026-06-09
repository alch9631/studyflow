"use client";

import { useEffect } from "react";
import { useToast } from "./Toast";
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

  useEffect(() => {
    setReplayErrorHandler(() =>
      toast(
        "Couldn't sync an offline change — please toggle it again.",
        "error",
      ),
    );
    const stop = startAutoReplay();
    return () => {
      setReplayErrorHandler(null);
      stop();
    };
  }, [toast]);

  return null;
}
