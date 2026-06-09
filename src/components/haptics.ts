/**
 * Light, guarded haptic feedback for touch interactions (toggle a session done,
 * commit a swipe). A no-op everywhere it isn't supported or wanted:
 *
 *   - SSR / no `navigator`          → silent
 *   - no Vibration API (desktop,    → silent
 *     iOS Safari, most browsers)
 *   - `prefers-reduced-motion`      → silent (treat it as "minimal feedback")
 *
 * So every callsite can fire-and-forget; the guards live here, not at the call.
 * Patterns are intentionally tiny — a tap should feel like a tick, not a buzz.
 */

function canVibrate(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.vibrate !== "function") return false;
  try {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    /* matchMedia unavailable — fall through and allow */
  }
  return true;
}

/** Fire a vibration pattern (ms, or on/off array). Safe to call anywhere. */
export function vibrate(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some engines throw if called too often / detached — ignore */
  }
}

export const haptics = {
  /** A single light tick — confirm a toggle/complete. */
  tap: () => vibrate(10),
  /** A committed, slightly firmer action — a swipe landed. */
  commit: () => vibrate(16),
  /** A short double-pulse for a destructive commit (swipe-to-delete). */
  warn: () => vibrate([18, 36, 18]),
};
