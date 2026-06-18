/**
 * Milestone treatment for the study-streak badge. The streak *value* itself is
 * computed server-side in `lib/stats` (`currentStreak` / `longestStreak`); this
 * is the pure, dependency-free presentation mapping — what the badge looks like
 * at a given length, with a gentle tint that warms at 3 / 7 / 30 consecutive
 * active study days. Kept under components/lib so it stays testable without JSX
 * (and src/lib/ remains server/data-only).
 */

import type { Translator } from "../i18n/messages";

/** Highest milestone reached: 0 (none), then 3, 7, 30 days. */
export type StreakLevel = 0 | 3 | 7 | 30;

/** Milestone thresholds, highest first (so `.find` returns the top one reached). */
export const STREAK_MILESTONES = [30, 7, 3] as const;

export type StreakStyle = {
  /** The highest milestone the streak has reached (0 below the first). */
  level: StreakLevel;
  /** Badge surface classes; the tint warms as the tier climbs. */
  badgeClass: string;
  /** Days until the next milestone, or `null` once the 30-day mark is passed. */
  toNext: number | null;
};

const STYLES: Record<StreakLevel, { badgeClass: string }> = {
  0: {
    badgeClass:
      "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
  },
  3: {
    badgeClass:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  },
  7: {
    badgeClass:
      "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300",
  },
  30: {
    badgeClass:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
  },
};

/** Map a streak length to its milestone tier + visual treatment. */
export function streakStyle(streak: number): StreakStyle {
  const level: StreakLevel = STREAK_MILESTONES.find((m) => streak >= m) ?? 0;
  const next = [3, 7, 30].find((m) => streak < m);
  return {
    level,
    badgeClass: STYLES[level].badgeClass,
    toNext: next === undefined ? null : next - streak,
  };
}

/** Localized streak label, e.g. "12-day streak" / "12-Tage-Serie". */
export function streakLabel(t: Translator, streak: number): string {
  return t("streak.label", { count: streak });
}
