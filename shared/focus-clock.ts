export type FocusClock = { elapsed: number; minutes: number; running: boolean; at: number };

/** A shorter target can stop the clock, but cannot take away time already studied. */
export function advanceFocusClock(clock: FocusClock, now: number): FocusClock {
  const limit = Math.max(clock.elapsed, clock.minutes * 60);
  const delta = clock.running ? Math.max(0, Math.floor((now - clock.at) / 1000)) : 0;
  const elapsed = Math.min(limit, clock.elapsed + delta);
  return { ...clock, elapsed, running: clock.running && elapsed < clock.minutes * 60, at: now };
}

export function restoreFocusClock(raw: string | null, now: number): FocusClock | null {
  try {
    const clock = JSON.parse(raw ?? "null");
    if (!clock || !Number.isFinite(clock.at) || !Number.isInteger(clock.elapsed) || clock.elapsed < 0 || clock.elapsed > 36000 ||
        !Number.isInteger(clock.minutes) || clock.minutes < 1 || clock.minutes > 600 || typeof clock.running !== "boolean") return null;
    return advanceFocusClock(clock, now);
  } catch { return null; }
}
