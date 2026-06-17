/**
 * Pure clock-time placement for a single day's study blocks (M3b).
 *
 * The day-level scheduler (planner / planService) decides WHICH blocks land on
 * WHICH day and for how many minutes. This layer is purely ADDITIVE: given that
 * day's blocks, it packs them into concrete start/end clock times inside a study
 * window, flowing around the day's fixed lectures (busy intervals). It never
 * changes how many minutes a block is or which day it's on — only when, during
 * the day, it happens.
 *
 * Everything here is pure and deterministic: no `Date.now()` / `new Date()`, no
 * process tz. Times are minutes-from-local-midnight; the caller maps them to UTC
 * instants on the block's day via src/lib/calendarTime.ts.
 */
import { MINUTES_PER_DAY } from "./calendarTime";

/** Energy preference — when in the window the student would rather study. */
export type Energy = "morning" | "evening" | "any";

/** A block to place: its id and how many minutes it needs. */
export type PlaceInput = { id: string; minutes: number };
/** A half-open busy interval [startMin, endMin) to flow around (e.g. a lecture). */
export type BusyInterval = { startMin: number; endMin: number };
/** The study window [startMin, endMin) blocks may be placed inside. */
export type StudyWindow = { startMin: number; endMin: number };

/** A placed block with its assigned clock times (minutes-of-day). */
export type Placed = { id: string; startMin: number; endMin: number };

export type PlaceResult = {
  placed: Placed[];
  /** ids of blocks that didn't fit anywhere in the window (never forced). */
  unplaced: string[];
};

/** Breathing room inserted between two consecutive study blocks when it fits. */
export const STUDY_GAP_MIN = 10;

/**
 * The free gaps inside `window`, with `busy` intervals carved out, clamped to the
 * day. Returned earliest-first as half-open [start, end) ranges; only positive-
 * length gaps are kept. Busy intervals are merged so overlapping lectures don't
 * produce spurious slivers.
 */
function freeGaps(window: StudyWindow, busy: BusyInterval[]): BusyInterval[] {
  const lo = Math.max(0, window.startMin);
  const hi = Math.min(MINUTES_PER_DAY, window.endMin);
  if (hi <= lo) return [];

  // Clamp busy to the window, drop empties, sort, then merge overlaps/touches.
  const clamped = busy
    .map((b) => ({ startMin: Math.max(lo, b.startMin), endMin: Math.min(hi, b.endMin) }))
    .filter((b) => b.endMin > b.startMin)
    .sort((a, b) => a.startMin - b.startMin);
  const merged: BusyInterval[] = [];
  for (const b of clamped) {
    const last = merged[merged.length - 1];
    if (last && b.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, b.endMin);
    } else {
      merged.push({ ...b });
    }
  }

  // Walk the window, emitting the gaps between merged busy blocks.
  const gaps: BusyInterval[] = [];
  let cursor = lo;
  for (const b of merged) {
    if (b.startMin > cursor) gaps.push({ startMin: cursor, endMin: b.startMin });
    cursor = Math.max(cursor, b.endMin);
  }
  if (cursor < hi) gaps.push({ startMin: cursor, endMin: hi });
  return gaps;
}

/**
 * Pack a day's `blocks` into the free time inside `window`, flowing around the
 * `busy` intervals (lectures). Blocks keep the order given; a {@link STUDY_GAP_MIN}
 * gap is inserted between consecutive blocks in the SAME gap when it still fits.
 * Nothing overlaps, nothing crosses the window end or local midnight, and a block
 * that can't fit anywhere goes to `unplaced` (never forced into an overlap).
 *
 * Energy steers WHERE in the day work lands:
 *  - "morning" / "any" → fill earliest free time first (front of the window);
 *  - "evening"         → pack toward the window end (latest free time first),
 *                        so the day's study clusters near the evening.
 *
 * Pure & deterministic — no wall clock, no tz.
 */
export function placeDayBlocks(
  blocks: PlaceInput[],
  busy: BusyInterval[],
  window: StudyWindow,
  energy: Energy,
): PlaceResult {
  const placed: Placed[] = [];
  const unplaced: string[] = [];

  // Only blocks with a real positive duration can be placed; a 0/negative/NaN
  // block can't occupy time, so it's reported unplaced rather than silently lost.
  const queue = blocks.filter((b) => {
    if (Number.isFinite(b.minutes) && b.minutes > 0) return true;
    unplaced.push(b.id);
    return false;
  });

  const gaps = freeGaps(window, busy);
  if (energy === "evening") {
    // Pack toward the end of the day: latest gaps first, and within a gap fill
    // from its END backward so consecutive blocks hug the window's tail.
    return placeEvening(queue, gaps, placed, unplaced);
  }
  return placeEarliest(queue, gaps, placed, unplaced);
}

/** Earliest-first packing ("morning" / "any"): walk gaps front-to-back. */
function placeEarliest(
  queue: PlaceInput[],
  gaps: BusyInterval[],
  placed: Placed[],
  unplaced: string[],
): PlaceResult {
  // Per-gap cursor: the next free minute in each gap. Insert a gap between two
  // blocks that share a gap (only when the spacer itself still fits the block).
  const cursors = gaps.map((g) => g.startMin);
  const usedInGap = gaps.map(() => false);

  outer: for (const block of queue) {
    for (let gi = 0; gi < gaps.length; gi++) {
      const need = block.minutes + (usedInGap[gi] ? STUDY_GAP_MIN : 0);
      if (cursors[gi] + need <= gaps[gi].endMin) {
        const start = cursors[gi] + (usedInGap[gi] ? STUDY_GAP_MIN : 0);
        placed.push({ id: block.id, startMin: start, endMin: start + block.minutes });
        cursors[gi] = start + block.minutes;
        usedInGap[gi] = true;
        continue outer;
      }
    }
    unplaced.push(block.id);
  }
  return { placed, unplaced };
}

/** Latest-first packing ("evening"): walk gaps back-to-front, fill each from end. */
function placeEvening(
  queue: PlaceInput[],
  gaps: BusyInterval[],
  placed: Placed[],
  unplaced: string[],
): PlaceResult {
  // Per-gap cursor: the next free minute counting DOWN from each gap's end.
  const cursors = gaps.map((g) => g.endMin);
  const usedInGap = gaps.map(() => false);

  outer: for (const block of queue) {
    for (let gi = gaps.length - 1; gi >= 0; gi--) {
      const need = block.minutes + (usedInGap[gi] ? STUDY_GAP_MIN : 0);
      if (cursors[gi] - need >= gaps[gi].startMin) {
        const end = cursors[gi] - (usedInGap[gi] ? STUDY_GAP_MIN : 0);
        placed.push({ id: block.id, startMin: end - block.minutes, endMin: end });
        cursors[gi] = end - block.minutes;
        usedInGap[gi] = true;
        continue outer;
      }
    }
    unplaced.push(block.id);
  }
  return { placed, unplaced };
}

// ── Preferences ──────────────────────────────────────────────────────────────

/** Parsed, validated scheduling preferences (minutes-of-day + energy). */
export type StudyPrefs = { dayStartMin: number; dayEndMin: number; energy: Energy };

/** Safe defaults when a user has no (or malformed) preferences: 08:00–22:00, any. */
export const DEFAULT_PREFS: StudyPrefs = {
  dayStartMin: 8 * 60, // 08:00
  dayEndMin: 22 * 60, // 22:00
  energy: "any",
};

function isEnergy(v: unknown): v is Energy {
  return v === "morning" || v === "evening" || v === "any";
}

/**
 * Parse the User.preferences JSON string into typed {@link StudyPrefs}, falling
 * back to {@link DEFAULT_PREFS} for anything missing or malformed. Tolerant by
 * design: a junk/legacy preferences blob must never break auto-scheduling, it
 * just yields the defaults. The window is sanitized to a same-day, positive-
 * length range inside [0, 1440); a degenerate range collapses to the default.
 */
export function parsePrefs(raw: string | null | undefined): StudyPrefs {
  if (!raw) return DEFAULT_PREFS;
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFS;
  }
  if (typeof obj !== "object" || obj === null) return DEFAULT_PREFS;
  const rec = obj as Record<string, unknown>;

  const start = Number(rec.dayStartMin);
  const end = Number(rec.dayEndMin);
  const energy = isEnergy(rec.energy) ? rec.energy : DEFAULT_PREFS.energy;

  const validWindow =
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start >= 0 &&
    end <= MINUTES_PER_DAY &&
    end > start;

  return validWindow
    ? { dayStartMin: start, dayEndMin: end, energy }
    : { ...DEFAULT_PREFS, energy };
}

/** Serialize prefs back to the JSON string stored in User.preferences. */
export function serializePrefs(prefs: StudyPrefs): string {
  return JSON.stringify({
    dayStartMin: prefs.dayStartMin,
    dayEndMin: prefs.dayEndMin,
    energy: prefs.energy,
  });
}
