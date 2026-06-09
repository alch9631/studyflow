/**
 * Unit tests for the streak-badge milestone mapping (presentation only — the
 * streak *value* is computed/tested in src/lib/stats.test.ts).
 * Run: npx tsx src/components/lib/streak.test.ts
 * (Dependency-free, same style as the lib/* suites.)
 */
import { streakStyle, streakLabel, STREAK_MILESTONES } from "./streak";

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

// ---- levels ----------------------------------------------------------------
check("0 days → level 0", streakStyle(0).level === 0);
check("2 days → still level 0", streakStyle(2).level === 0);
check("3 days → level 3", streakStyle(3).level === 3);
check("6 days → still level 3", streakStyle(6).level === 3);
check("7 days → level 7", streakStyle(7).level === 7);
check("29 days → still level 7", streakStyle(29).level === 7);
check("30 days → level 30", streakStyle(30).level === 30);
check("100 days → caps at level 30", streakStyle(100).level === 30);

// ---- days-to-next-milestone ------------------------------------------------
check("0 → 3 to next", streakStyle(0).toNext === 3);
check("1 → 2 to next", streakStyle(1).toNext === 2);
check("3 → 4 to next (7-day)", streakStyle(3).toNext === 4);
check("7 → 23 to next (30-day)", streakStyle(7).toNext === 23);
check("29 → 1 to next", streakStyle(29).toNext === 1);
check("30 → no next milestone", streakStyle(30).toNext === null);
check("100 → no next milestone", streakStyle(100).toNext === null);

// ---- flame intensity scales with tier --------------------------------------
check("level 0/3 → single flame", streakStyle(3).flames === "🔥");
check("level 7 → double flame", streakStyle(7).flames === "🔥🔥");
check("level 30 → triple flame", streakStyle(30).flames === "🔥🔥🔥");

// ---- badge classes are tier-specific & non-empty ---------------------------
check("badgeClass non-empty", streakStyle(5).badgeClass.length > 0);
check(
  "tints differ across tiers",
  new Set([
    streakStyle(0).badgeClass,
    streakStyle(3).badgeClass,
    streakStyle(7).badgeClass,
    streakStyle(30).badgeClass,
  ]).size === 4,
);

// ---- milestone constant ----------------------------------------------------
check("milestones are 30/7/3 (highest first)", STREAK_MILESTONES.join(",") === "30,7,3");

// ---- label -----------------------------------------------------------------
check("label singular form", streakLabel(1) === "1-day streak");
check("label multi-day", streakLabel(12) === "12-day streak");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
