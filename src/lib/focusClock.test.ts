import assert from "node:assert/strict";
import { advanceFocusClock, restoreFocusClock } from "./focusClock";
import { focusHref } from "./focusNavigation";
import { sessionDurationChoices } from "../../shared/session-duration";
import { preferredProgress } from "../../shared/mobile";

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
assert.deepEqual(sessionDurationChoices(25, 0), { minimum: 1, options: [10, 30, 60, 90], selected: 30 }, "web and native offer the same start choices");
assert.equal(sessionDurationChoices(30, 1850).selected, 60, "a resumed session cannot choose a target below already earned time");
assert.equal(sessionDurationChoices(90, 7200).selected, 121, "long sessions stay resumable beyond the presets");
assert.equal(sessionDurationChoices(600, 36000).selected, 600, "the maximum session stays within the validated cap");
const local = { updatedAt: "2026-11-02T09:00:00.000Z", response: "local", paused: true };
const remote = { updatedAt: local.updatedAt, response: "remote" };
assert.equal(preferredProgress(local, remote), local, "an equal checkpoint retains device-only pause state");
assert.equal(preferredProgress(local, { ...remote, updatedAt: "2026-11-02T09:01:00.000Z" })?.response, "remote", "an old local clock cannot replace a newer answer from the web");
console.log("Focus clock checks passed: target changes, reloads, suspension, paused time, clock corrections and stable links.");
