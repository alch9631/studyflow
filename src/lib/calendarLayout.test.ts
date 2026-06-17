/**
 * Tests for the calendar's overlap column-layout math. Run:
 *   npx tsx src/lib/calendarLayout.test.ts
 *
 * Covers: no-overlap blocks stay full width; two overlapping blocks split into
 * two lanes; a transitively-connected cluster (A∩B, B∩C, A⊥C) shares one width;
 * touching edges don't count as overlap; lanes are reused once a block ends;
 * output preserves input order; determinism regardless of input order.
 */
import { layoutDayBlocks, type LayoutInput } from "./calendarLayout";

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

const byId = (out: ReturnType<typeof layoutDayBlocks>) =>
  new Map(out.map((b) => [b.id, b]));

// ── empty ─────────────────────────────────────────────────────────────────────
check("empty in → empty out", layoutDayBlocks([]).length === 0);

// ── single block → full width, lane 0 ────────────────────────────────────────
{
  const out = layoutDayBlocks([{ id: "a", startMin: 600, endMin: 660 }]);
  check("single block lane 0", out[0].lane === 0);
  check("single block lanes 1", out[0].lanes === 1);
}

// ── two disjoint blocks → both full width ────────────────────────────────────
{
  const m = byId(
    layoutDayBlocks([
      { id: "a", startMin: 600, endMin: 660 },
      { id: "b", startMin: 700, endMin: 760 },
    ]),
  );
  check("disjoint a lanes 1", m.get("a")!.lanes === 1);
  check("disjoint b lanes 1", m.get("b")!.lanes === 1);
  check("disjoint reuse lane 0", m.get("a")!.lane === 0 && m.get("b")!.lane === 0);
}

// ── two overlapping blocks → two lanes ───────────────────────────────────────
{
  const m = byId(
    layoutDayBlocks([
      { id: "a", startMin: 600, endMin: 660 },
      { id: "b", startMin: 630, endMin: 690 },
    ]),
  );
  check("overlap a lanes 2", m.get("a")!.lanes === 2);
  check("overlap b lanes 2", m.get("b")!.lanes === 2);
  check("overlap distinct lanes", m.get("a")!.lane !== m.get("b")!.lane);
}

// ── touching edges (a.end === b.start) → NOT overlapping ──────────────────────
{
  const m = byId(
    layoutDayBlocks([
      { id: "a", startMin: 600, endMin: 660 },
      { id: "b", startMin: 660, endMin: 720 },
    ]),
  );
  check("touching not overlap", m.get("a")!.lanes === 1 && m.get("b")!.lanes === 1);
}

// ── transitive cluster: A∩B, B∩C, but A ⊥ C → all share lanes=2 ──────────────
// A 600–660, B 640–700, C 670–730 → A∩B, B∩C, A and C disjoint. Max concurrent
// is 2, and the cluster width is uniform 2 so widths line up across the run.
{
  const m = byId(
    layoutDayBlocks([
      { id: "a", startMin: 600, endMin: 660 },
      { id: "b", startMin: 640, endMin: 700 },
      { id: "c", startMin: 670, endMin: 730 },
    ]),
  );
  check("chain a lanes 2", m.get("a")!.lanes === 2);
  check("chain b lanes 2", m.get("b")!.lanes === 2);
  check("chain c lanes 2", m.get("c")!.lanes === 2);
  // C can reuse A's lane (A ended at 660, C starts 670).
  check("chain c reuses lane 0", m.get("c")!.lane === 0);
  check("chain b lane 1", m.get("b")!.lane === 1);
}

// ── triple simultaneous overlap → three lanes ────────────────────────────────
{
  const m = byId(
    layoutDayBlocks([
      { id: "a", startMin: 600, endMin: 720 },
      { id: "b", startMin: 610, endMin: 720 },
      { id: "c", startMin: 620, endMin: 720 },
    ]),
  );
  check("triple lanes 3", m.get("a")!.lanes === 3 && m.get("c")!.lanes === 3);
  check(
    "triple distinct lanes",
    new Set([m.get("a")!.lane, m.get("b")!.lane, m.get("c")!.lane]).size === 3,
  );
}

// ── output preserves input order ─────────────────────────────────────────────
{
  const input: LayoutInput[] = [
    { id: "z", startMin: 700, endMin: 760 },
    { id: "y", startMin: 600, endMin: 660 },
  ];
  const out = layoutDayBlocks(input);
  check("preserves input order", out[0].id === "z" && out[1].id === "y");
}

// ── determinism: shuffled input → same lane assignment ───────────────────────
{
  const a = byId(
    layoutDayBlocks([
      { id: "a", startMin: 600, endMin: 660 },
      { id: "b", startMin: 630, endMin: 690 },
      { id: "c", startMin: 640, endMin: 700 },
    ]),
  );
  const b = byId(
    layoutDayBlocks([
      { id: "c", startMin: 640, endMin: 700 },
      { id: "a", startMin: 600, endMin: 660 },
      { id: "b", startMin: 630, endMin: 690 },
    ]),
  );
  check(
    "deterministic lanes",
    a.get("a")!.lane === b.get("a")!.lane &&
      a.get("b")!.lane === b.get("b")!.lane &&
      a.get("c")!.lane === b.get("c")!.lane,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
