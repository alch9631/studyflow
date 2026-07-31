/**
 * Calendar optimistic-overlay tests.
 *
 * Regression 1 (resize): the end-minute override was only removed when the
 * server REJECTED the resize. After a successful one it lived forever, so when
 * the block later moved (drag to another day/time), the stale override pinned
 * `endMin` to the old value — the card rendered an inverted "15:00–11:00"
 * sliver and the next resize wrote that corrupted duration back to the DB.
 *
 * Regression 2 (unschedule): a block dragged to the unscheduled lane and later
 * re-placed via the mobile placement sheet or auto-arrange kept rendering as
 * unscheduled forever (those paths never cleared the overlay), so the student
 * kept "placing" a session that was already scheduled.
 *
 * The fix: overlays are base-tagged with the server value they were computed
 * against, apply only while server truth still matches, and are pruned the
 * moment it doesn't.
 *
 * Run: npx tsx src/lib/calendarOverrides.test.ts
 */
import {
  applyBlockOverrides,
  pruneEndOverrides,
  pruneUnscheduledOverrides,
  type EndOverride,
  type OverridableBlock,
  type UnscheduledOverride,
} from "./calendarOverrides";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const block = (over?: Partial<OverridableBlock>): OverridableBlock => ({
  id: "A",
  dayISO: "2026-08-03",
  startMin: 540, // 09:00
  endMin: 600, // 10:00
  completed: false,
  ...over,
});

const none = {} as Record<string, never>;

console.log("\n=== calendar overlay lifecycle ===\n");

// ── The resize overlay's whole life ─────────────────────────────────────────
{
  // 1. Mid-gesture: server still 540–600, user dragged the end to 11:00.
  const end: Record<string, EndOverride> = { A: { endMin: 660, base: 600 } };
  const mid = applyBlockOverrides(block(), none, end, none);
  check("mid-resize: the dragged end renders", mid.endMin === 660 && mid.startMin === 540);

  // 2. Server accepts (refresh brings 540–660): base no longer matches.
  const after = applyBlockOverrides(block({ endMin: 660 }), none, end, none);
  check("after accept: server truth renders (overlay expired)", after.endMin === 660);
  const pruned = pruneEndOverrides(end, [block({ endMin: 660 })]);
  check("after accept: the overlay is pruned", !("A" in pruned));

  // 3. THE regression: block later drag-moves to Tue 15:00–17:00. A stale
  //    overlay must not pin endMin to the old day's 660.
  const moved = block({ dayISO: "2026-08-04", startMin: 900, endMin: 1020 });
  const view = applyBlockOverrides(moved, none, end, none);
  check(
    "after a later move: no inverted interval from a stale resize overlay",
    view.startMin === 900 && view.endMin === 1020,
    `got ${view.startMin}–${view.endMin}`,
  );
  check(
    "sanity: interval stays positive whatever the overlay state",
    (view.endMin ?? 0) > (view.startMin ?? 0),
  );

  // 4. Failure path: server kept 600 → overlay STILL applies until reverted
  //    (the gesture's own revert() deletes it); pruning keeps it meanwhile.
  const kept = pruneEndOverrides(end, [block()]);
  check("while server still reports the base, the overlay survives pruning", "A" in kept);
}

// ── The unschedule overlay's whole life ─────────────────────────────────────
{
  // 1. Dragged into the lane: server still has times → renders unscheduled.
  const un: Record<string, UnscheduledOverride> = {
    A: { dayISO: "2026-08-03", baseStart: 540, baseEnd: 600 },
  };
  const mid = applyBlockOverrides(block(), none, none, un);
  check(
    "mid-unschedule: renders in the lane with times nulled",
    mid.startMin === null && mid.endMin === null && mid.dayISO === "2026-08-03",
  );

  // 2. Server accepts the clear: times now null → base mismatch → expired.
  const cleared = block({ startMin: null, endMin: null });
  const after = applyBlockOverrides(cleared, none, none, un);
  check("after accept: still renders unscheduled (server truth)", after.startMin === null);
  const pruned = pruneUnscheduledOverrides(un, [cleared]);
  check("after accept: the overlay is pruned", !("A" in pruned));

  // 3. THE regression: the block regains a time via the placement sheet /
  //    auto-arrange (paths that never touched the overlay map). It must render
  //    scheduled — it used to sit in the lane forever.
  //    3a. Re-placed at a NEW time: the base mismatch alone expires the overlay.
  const placedElsewhere = block({ startMin: 900, endMin: 960 });
  const viewNew = applyBlockOverrides(placedElsewhere, none, none, un);
  check(
    "re-placed at a new time: renders scheduled, not stuck in the lane",
    viewNew.startMin === 900 && viewNew.endMin === 960,
    `got startMin=${viewNew.startMin}`,
  );
  //    3b. Re-placed at the SAME time as before the unschedule: the base
  //    coincidentally matches again, so expiry alone can't save us — the prune
  //    that ran when the cleared refresh landed (step 2, the component's effect
  //    on [blocks]) must already have dropped the entry.
  const placedBack = block({ startMin: 540, endMin: 600 });
  const prunedThenPlaced = applyBlockOverrides(placedBack, none, none, pruned);
  check(
    "re-placed at the SAME time: the step-2 prune prevents resurrection",
    prunedThenPlaced.startMin === 540 && prunedThenPlaced.endMin === 600,
    `got startMin=${prunedThenPlaced.startMin}`,
  );

  // 4. Failure path: server never cleared (still 540–600) → overlay applies
  //    until the gesture's revert() removes it.
  const kept = pruneUnscheduledOverrides(un, [block()]);
  check("while the clear is in flight, the overlay survives pruning", "A" in kept);
}

// ── Pruning mechanics ───────────────────────────────────────────────────────
{
  const end: Record<string, EndOverride> = {
    A: { endMin: 660, base: 600 },
    GONE: { endMin: 300, base: 240 },
  };
  const pruned = pruneEndOverrides(end, [block()]);
  check("an overlay whose block disappeared is pruned", !("GONE" in pruned) && "A" in pruned);

  const same = pruneEndOverrides({ A: { endMin: 660, base: 600 } }, [block()]);
  const stable = pruneEndOverrides(same, [block()]);
  check(
    "pruning with nothing to drop returns the SAME object (effect settles)",
    same === stable,
  );

  const empty = pruneEndOverrides({}, [block()]);
  const emptyAgain = pruneEndOverrides(empty, [block()]);
  check("empty map is stable under pruning", empty === emptyAgain);
}

// ── done overlay passthrough (untouched behaviour) ──────────────────────────
{
  const view = applyBlockOverrides(block(), { A: true }, none, none);
  check("done overlay still applies", view.completed === true);
  const viewOther = applyBlockOverrides(block({ id: "B" }), { A: true }, none, none);
  check("done overlay only hits its own block", viewOther.completed === false);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
