"use client";

import { useSyncExternalStore } from "react";
import ToastForm from "@/components/ToastForm";
import SubmitButton from "@/components/SubmitButton";
import { logFocus } from "../courses/actions";

/** Same key the Focus Timer (PomodoroTimer) persists its focus length to. */
const FOCUS_KEY = "sf-focus-min";
const DEFAULT_FOCUS = 25;

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener("sf-focus-change", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("sf-focus-change", cb);
  };
}

function readFocus(): number {
  try {
    const v = parseInt(localStorage.getItem(FOCUS_KEY) ?? "", 10);
    if (!Number.isNaN(v) && v >= 1 && v <= 180) return v;
  } catch {}
  return DEFAULT_FOCUS;
}

/**
 * "Log a focus session" button for a Today block. Its minutes track the Focus
 * Timer's selected focus length (`sf-focus-min`) so the number here always
 * matches the timer above — change the timer to 50 min and these become +50m.
 */
export default function FocusLogButton({ blockId }: { blockId: string }) {
  const focusMin = useSyncExternalStore(subscribe, readFocus, () => DEFAULT_FOCUS);

  return (
    <ToastForm
      action={logFocus}
      successMessage={`Logged a ${focusMin}-min focus session. 🍅`}
      errorMessage="Couldn't log that focus session — please try again."
      className="shrink-0"
    >
      <input type="hidden" name="blockId" value={blockId} />
      <input type="hidden" name="minutes" value={focusMin} />
      <input type="hidden" name="revalidate" value="/today" />
      <SubmitButton
        variant="secondary"
        size="md"
        className="whitespace-nowrap"
        title={`Log a ${focusMin}-min focus session`}
      >
        <span suppressHydrationWarning>🍅 +{focusMin}m</span>
      </SubmitButton>
    </ToastForm>
  );
}
