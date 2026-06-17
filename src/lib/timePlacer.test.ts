/**
 * Tests for the pure clock-time placement layer (M3b). Run:
 *   npx tsx src/lib/timePlacer.test.ts
 *
 * Pure, deterministic packing: no wall clock involved. We cover in-order packing,
 * lecture/busy avoidance, morning vs evening ordering, the inter-block gap,
 * window-overflow → unplaced, and empty/degenerate inputs. Plus the preferences
 * parser (defaults, valid window, junk tolerance).
 */
import {
  placeDayBlocks,
  parsePrefs,
  serializePrefs,
  DEFAULT_PREFS,
  STUDY_GAP_MIN,
  type Placed,
} from "./timePlacer";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}

const byId = (placed: Placed[]) => new Map(placed.map((p) => [p.id, p]));
const WIN = { startMin: 8 * 60, endMin: 22 * 60 }; // 08:00–22:00

// ── packing in order (no busy) ────────────────────────────────────────────────
{
  const r = placeDayBlocks(
    [
      { id: "a", minutes: 60 },
      { id: "b", minutes: 30 },
    ],
    [],
    WIN,
    "any",
  );
  const m = byId(r.placed);
  check("packs all blocks", r.placed.length === 2 && r.unplaced.length === 0);
  check("first block at window start", m.get("a")!.startMin === 480 && m.get("a")!.endMin === 540);
  check(
    "second block after first + gap",
    m.get("b")!.startMin === 540 + STUDY_GAP_MIN && m.get("b")!.endMin === 540 + STUDY_GAP_MIN + 30,
  );
  check("no overlap between consecutive blocks", m.get("a")!.endMin <= m.get("b")!.startMin);
}

// ── gap insertion only between same-gap blocks (not before the first) ──────────
{
  const r = placeDayBlocks([{ id: "a", minutes: 60 }], [], WIN, "any");
  check("single block starts at window start (no leading gap)", r.placed[0].startMin === 480);
}

// ── busy / lecture avoidance ──────────────────────────────────────────────────
{
  // Lecture 09:00–11:00. A 90-min block can't fit 08:00–09:00 (only 60 free), so
  // it must land after the lecture, at 11:00.
  const r = placeDayBlocks(
    [{ id: "a", minutes: 90 }],
    [{ startMin: 9 * 60, endMin: 11 * 60 }],
    WIN,
    "morning",
  );
  const p = r.placed[0];
  check("block flows around the lecture", p.startMin === 11 * 60 && p.endMin === 11 * 60 + 90);
}
{
  // A short block DOES fit the 08:00–09:00 pre-lecture gap.
  const r = placeDayBlocks(
    [{ id: "a", minutes: 45 }],
    [{ startMin: 9 * 60, endMin: 11 * 60 }],
    WIN,
    "morning",
  );
  check("short block uses the pre-lecture gap", r.placed[0].startMin === 480 && r.placed[0].endMin === 525);
}
{
  // Never overlaps a lecture: place two blocks around a midday lecture.
  const lec = { startMin: 12 * 60, endMin: 13 * 60 };
  const r = placeDayBlocks(
    [
      { id: "a", minutes: 60 },
      { id: "b", minutes: 60 },
    ],
    [lec],
    WIN,
    "any",
  );
  const noOverlap = r.placed.every(
    (p) => p.endMin <= lec.startMin || p.startMin >= lec.endMin,
  );
  check("no placed block overlaps a lecture", noOverlap && r.placed.length === 2);
}

// ── morning vs evening ordering ───────────────────────────────────────────────
{
  const blocks = [{ id: "a", minutes: 60 }];
  const morning = placeDayBlocks(blocks, [], WIN, "morning").placed[0];
  const evening = placeDayBlocks(blocks, [], WIN, "evening").placed[0];
  check("morning fills earliest", morning.startMin === 480);
  check("evening packs toward window end", evening.endMin === 22 * 60 && evening.startMin === 22 * 60 - 60);
  check("morning earlier than evening", morning.startMin < evening.startMin);
}
{
  // Evening: two blocks should hug the end, separated by the gap, latest first.
  const r = placeDayBlocks(
    [
      { id: "a", minutes: 60 },
      { id: "b", minutes: 60 },
    ],
    [],
    WIN,
    "evening",
  );
  const m = byId(r.placed);
  check("evening: a at the very end", m.get("a")!.endMin === 22 * 60);
  check(
    "evening: b just before a + gap",
    m.get("b")!.endMin === m.get("a")!.startMin - STUDY_GAP_MIN,
  );
  check("evening: no overlap", m.get("b")!.endMin <= m.get("a")!.startMin);
}

// ── overflow → unplaced (don't force overlaps) ────────────────────────────────
{
  // Window is 60 min wide; two 60-min blocks can't both fit.
  const tiny = { startMin: 8 * 60, endMin: 9 * 60 };
  const r = placeDayBlocks(
    [
      { id: "a", minutes: 60 },
      { id: "b", minutes: 60 },
    ],
    [],
    tiny,
    "any",
  );
  check("overflow: first placed, second unplaced", r.placed.length === 1 && r.unplaced.length === 1);
  check("overflow: a is the one placed", r.placed[0].id === "a" && r.unplaced[0] === "b");
}
{
  // A block longer than the entire window can never be placed.
  const r = placeDayBlocks([{ id: "a", minutes: 24 * 60 }], [], WIN, "any");
  check("oversize block → unplaced", r.placed.length === 0 && r.unplaced[0] === "a");
}

// ── never crosses window end / midnight ───────────────────────────────────────
{
  const lateWin = { startMin: 23 * 60, endMin: 24 * 60 }; // 23:00–24:00
  const r = placeDayBlocks([{ id: "a", minutes: 30 }], [], lateWin, "any");
  check("respects window end (no midnight cross)", r.placed[0].endMin <= 24 * 60);
}

// ── empty / degenerate inputs ─────────────────────────────────────────────────
{
  const r = placeDayBlocks([], [], WIN, "any");
  check("empty blocks → empty result", r.placed.length === 0 && r.unplaced.length === 0);
}
{
  // Zero/negative-minute blocks can't occupy time → reported unplaced.
  const r = placeDayBlocks([{ id: "z", minutes: 0 }], [], WIN, "any");
  check("zero-minute block → unplaced", r.placed.length === 0 && r.unplaced[0] === "z");
}
{
  // A window fully covered by a lecture leaves no room.
  const r = placeDayBlocks([{ id: "a", minutes: 30 }], [{ startMin: 0, endMin: 24 * 60 }], WIN, "any");
  check("fully-busy window → all unplaced", r.placed.length === 0 && r.unplaced[0] === "a");
}

// ── preferences parser ────────────────────────────────────────────────────────
check("prefs: null → defaults", JSON.stringify(parsePrefs(null)) === JSON.stringify(DEFAULT_PREFS));
check("prefs: empty → defaults", JSON.stringify(parsePrefs("")) === JSON.stringify(DEFAULT_PREFS));
check("prefs: junk JSON → defaults", JSON.stringify(parsePrefs("{not json")) === JSON.stringify(DEFAULT_PREFS));
{
  const p = parsePrefs(JSON.stringify({ dayStartMin: 540, dayEndMin: 1200, energy: "evening" }));
  check("prefs: valid window parsed", p.dayStartMin === 540 && p.dayEndMin === 1200 && p.energy === "evening");
}
{
  // Bad window (end <= start) collapses to default window but keeps a valid energy.
  const p = parsePrefs(JSON.stringify({ dayStartMin: 1200, dayEndMin: 600, energy: "morning" }));
  check(
    "prefs: bad window → default window, kept energy",
    p.dayStartMin === DEFAULT_PREFS.dayStartMin && p.dayEndMin === DEFAULT_PREFS.dayEndMin && p.energy === "morning",
  );
}
{
  const p = parsePrefs(JSON.stringify({ energy: "bogus" }));
  check("prefs: bad energy → default energy", p.energy === "any");
}
check(
  "prefs: round-trips through serialize",
  JSON.stringify(parsePrefs(serializePrefs({ dayStartMin: 480, dayEndMin: 1320, energy: "morning" }))) ===
    JSON.stringify({ dayStartMin: 480, dayEndMin: 1320, energy: "morning" }),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
