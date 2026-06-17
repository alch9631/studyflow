/**
 * Tests for the explain-my-plan reasoning. Run: npx tsx src/lib/planExplain.test.ts
 *
 * These assert the explanation is TRUTHFUL — derived from the same deterministic
 * signals the planner/cockpit use (capacity math + exam-date/effort ordering) —
 * and never fabricates anything. Pure functions, no clock/DB, so deterministic.
 */
import {
  explainCapacity,
  explainOrder,
  topOrderReason,
  explainPlan,
  type ExplainCapacity,
  type ExplainCourse,
} from "./planExplain";

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

// Build a capacity input from remaining/available, mirroring computeCapacity.
const cap = (remainingMin: number, availableMin: number): ExplainCapacity => {
  const rem = Math.max(0, remainingMin);
  const avail = Math.max(0, availableMin);
  return {
    remainingMin: rem,
    availableMin: avail,
    overMin: Math.max(0, rem - avail),
    freeMin: Math.max(0, avail - rem),
    onTrack: rem <= avail,
  };
};

const course = (id: string, name: string, examDays: number, remainingMin: number): ExplainCourse => ({
  id,
  name,
  examDays,
  remainingMin,
});

// ── explainCapacity ───────────────────────────────────────────────────────
{
  const r = explainCapacity(cap(0, 120));
  check("clear when nothing remains", r.kind === "clear");
}
{
  const r = explainCapacity(cap(180, 120));
  check("over when remaining exceeds available", r.kind === "over");
  check("over reports the deficit", r.kind === "over" && r.overMin === 60);
}
{
  // freeMin = 10, available = 120 → 10 <= 24 (20%) → tight.
  const r = explainCapacity(cap(110, 120));
  check("tight when slack is small", r.kind === "tight");
  check("tight reports the slack", r.kind === "tight" && r.freeMin === 10);
}
{
  // freeMin = 90, available = 120 → 90 > 24 → on track.
  const r = explainCapacity(cap(30, 120));
  check("ontrack with comfortable slack", r.kind === "ontrack");
  check("ontrack reports remaining + available", r.kind === "ontrack" && r.remainingMin === 30 && r.availableMin === 120);
}
{
  // Zero available but work remaining → over (not a false "tight").
  const r = explainCapacity(cap(60, 0));
  check("over when no focus time at all", r.kind === "over" && r.overMin === 60);
}

// ── explainOrder ──────────────────────────────────────────────────────────
{
  const r = explainOrder(course("a", "OS", 4, 60), course("b", "Algo", 24, 90));
  check("sooner exam wins regardless of arg order", r.kind === "sooner-exam");
  check("sooner exam names the nearer one first", r.kind === "sooner-exam" && r.before === "OS");
  check("sooner exam keeps real day counts", r.kind === "sooner-exam" && r.beforeDays === 4 && r.afterDays === 24);
}
{
  // Same exam day → more remaining work leads.
  const r = explainOrder(course("a", "OS", 10, 30), course("b", "Algo", 10, 120));
  check("equal exam → more work leads", r.kind === "more-effort" && r.before === "Algo");
  check("more-effort keeps real minutes", r.kind === "more-effort" && r.beforeMin === 120 && r.afterMin === 30);
}
{
  const r = explainOrder(course("a", "OS", 10, 60), course("b", "Algo", 10, 60));
  check("equal exam + equal work → tie", r.kind === "tie");
}

// ── topOrderReason ────────────────────────────────────────────────────────
{
  const reason = topOrderReason([
    course("a", "Algo", 24, 90),
    course("b", "OS", 4, 60),
    course("c", "Math", 50, 0), // no remaining work → excluded
  ]);
  check("top reason compares the two highest-priority active courses", reason?.kind === "sooner-exam");
  check("top reason leads with the soonest exam", reason?.kind === "sooner-exam" && reason.before === "OS");
}
{
  const reason = topOrderReason([course("a", "OS", 4, 60)]);
  check("no order reason with a single active course", reason === null);
}
{
  const reason = topOrderReason([
    course("a", "OS", 4, 0), // no remaining work
    course("b", "Algo", 24, 0), // no remaining work
  ]);
  check("no order reason when nothing has remaining work", reason === null);
}

// ── explainPlan (bundle) ──────────────────────────────────────────────────
{
  const r = explainPlan(cap(180, 120), [
    course("a", "OS", 4, 120),
    course("b", "Algo", 24, 60),
  ]);
  check("bundle carries the capacity reason", r.capacity.kind === "over");
  check("bundle carries the order reason", r.order?.kind === "sooner-exam");
}

console.log(`\nplanExplain: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
