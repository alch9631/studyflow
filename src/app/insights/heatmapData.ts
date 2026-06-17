// Pure date math for the study heatmap. Turns completed StudyBlocks into a
// Monday-aligned grid of day cells (oldest → newest) covering the last ~12 weeks,
// so the page stays thin and this stays deterministic + unit-testable. Day
// bucketing uses Berlin calendar days — consistent with how blocks are stored
// (UTC-midnight of the Berlin day) and with todayISO().

import type { HeatmapDay } from "./StudyHeatmap";

const DAY_MS = 86_400_000;

/** Number of trailing whole weeks the heatmap shows. */
export const HEATMAP_WEEKS = 12;

/** Parse a YYYY-MM-DD string to its UTC-midnight Date. */
function isoToDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

/** UTC day key (YYYY-MM-DD) for a Date — matches how blocks are stored. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type HeatmapBlock = { date: Date; minutes: number; completed: boolean };

/**
 * Build the heatmap grid as-of `todayISO` (Berlin day). The grid starts on the
 * Monday `HEATMAP_WEEKS - 1` weeks before the Monday of "this" week and runs
 * through the Sunday that ends the current week, so it's always a whole number of
 * 7-day columns. Days after today are flagged `future` (empty placeholders).
 *
 * @param examDates exam dates (instants); any day in the same Mon–Sun week as an
 *   exam is flagged `examWeek`.
 */
export function buildHeatmap(
  blocks: HeatmapBlock[],
  examDates: Date[],
  todayISO: string,
  tz: string,
  formatDay: (instant: Date, tz: string) => string,
): HeatmapDay[] {
  const today = isoToDate(todayISO);
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (dow + 6) % 7; // days since Monday
  const thisMonday = new Date(today.getTime() - mondayOffset * DAY_MS);
  const start = new Date(thisMonday.getTime() - (HEATMAP_WEEKS - 1) * 7 * DAY_MS);
  const totalDays = HEATMAP_WEEKS * 7;

  // Completed minutes per Berlin day.
  const minByDay = new Map<string, number>();
  for (const b of blocks) {
    if (!b.completed) continue;
    const key = formatDay(b.date, tz);
    minByDay.set(key, (minByDay.get(key) ?? 0) + b.minutes);
  }

  // Mark every Mon–Sun week that contains an exam (by the week's Monday key).
  const examMondays = new Set<string>();
  for (const ex of examDates) {
    const exKey = formatDay(ex, tz);
    const exDate = isoToDate(exKey);
    const exDow = exDate.getUTCDay();
    const exMonday = new Date(exDate.getTime() - ((exDow + 6) % 7) * DAY_MS);
    examMondays.add(dayKey(exMonday));
  }

  const todayKey = dayKey(today);
  const days: HeatmapDay[] = [];
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const key = dayKey(d);
    // Monday of this cell's week (cells are emitted Mon..Sun within each column).
    const colMonday = new Date(start.getTime() + Math.floor(i / 7) * 7 * DAY_MS);
    days.push({
      date: key,
      min: minByDay.get(key) ?? 0,
      examWeek: examMondays.has(dayKey(colMonday)),
      future: key > todayKey,
    });
  }
  return days;
}
