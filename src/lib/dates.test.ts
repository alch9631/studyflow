/**
 * Tests for the date helpers. Run: npx tsx src/lib/dates.test.ts
 */
import { daysUntil, examCountdownLabel, dueLabel } from "./dates";

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

const d = (iso: string) => new Date(iso + "T00:00:00Z");

// daysUntil
check("same day = 0", daysUntil(d("2026-06-07"), "2026-06-07") === 0);
check("tomorrow = 1", daysUntil(d("2026-06-08"), "2026-06-07") === 1);
check("yesterday = -1", daysUntil(d("2026-06-06"), "2026-06-07") === -1);
check("a week = 7", daysUntil(d("2026-06-14"), "2026-06-07") === 7);
check("across month boundary", daysUntil(d("2026-07-01"), "2026-06-29") === 2);

// examCountdownLabel
check("exam passed", examCountdownLabel(-1) === "exam passed");
check("exam today", examCountdownLabel(0) === "exam today");
check("exam tomorrow", examCountdownLabel(1) === "exam tomorrow");
check("days to exam", examCountdownLabel(5) === "5 days to exam");
check("weeks to exam", examCountdownLabel(42) === "6 weeks to exam");

// dueLabel
check("overdue", dueLabel(-3) === "overdue");
check("due today", dueLabel(0) === "due today");
check("due tomorrow", dueLabel(1) === "due tomorrow");
check("days left", dueLabel(5) === "5 days left");
check("weeks left", dueLabel(21) === "3 weeks left");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
