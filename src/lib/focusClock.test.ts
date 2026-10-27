import assert from "node:assert/strict";
import { advanceFocusClock, restoreFocusClock } from "./focusClock";
import { focusHref } from "./focusNavigation";

const clock = { elapsed: 1200, minutes: 15, running: false, at: 1000 };
assert.equal(restoreFocusClock(JSON.stringify(clock), 61000)?.elapsed, 1200, "shortening a paused target preserves twenty minutes on reload");
assert.deepEqual(advanceFocusClock({ ...clock, running: true }, 61000), { ...clock, at: 61000 }, "shortening a running target stops it without losing earned time");
assert.equal(advanceFocusClock({ ...clock, elapsed: 60, running: true }, 3601000).elapsed, 900, "background time stops at the target");
assert.equal(advanceFocusClock({ ...clock, minutes: 30, running: true }, -1000).elapsed, 1200, "clock corrections cannot subtract study time");
assert.equal(advanceFocusClock({ ...clock, minutes: 30 }, 3601000).elapsed, 1200, "paused time never advances");
assert.equal(restoreFocusClock("{", 1000), null);
assert.equal(restoreFocusClock(JSON.stringify({ ...clock, minutes: 2, elapsed: 15 }), 1000)?.minutes, 2, "short planner remainders are valid clocks");
for (const bad of [{ elapsed: -1 }, { elapsed: 36001 }, { minutes: 0 }, { running: "true" }, { at: null }]) {
  assert.equal(restoreFocusClock(JSON.stringify({ ...clock, ...bad }), 1000), null);
}
assert.equal(focusHref("a/b", "topic&1"), "/focus?blockId=a%2Fb&topicId=topic%261", "stable topic links escape both identifiers");
console.log("Focus clock checks passed: target changes, reloads, suspension, paused time, clock corrections and stable links.");
