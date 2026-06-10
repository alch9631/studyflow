// Small, dependency-free date helpers (safe to import in client components).

/**
 * Whole calendar days from `todayISO` to `date`. Negative = past, 0 = today.
 *
 * Both sides are reduced to a UTC calendar date before subtracting, so the result
 * is a pure day count — immune to DST and to how long any given local day is.
 * `todayISO` (YYYY-MM-DD) is the app's "today", a Europe/Berlin calendar date (see
 * planService.todayISO); `date` is read by its UTC calendar date, matching how
 * dates are persisted (UTC midnight) and how stats.dayKey buckets them. Pass a
 * UTC-midnight Date so its calendar date is unambiguous. Returns NaN if either
 * input is invalid.
 */
export function daysUntil(date: Date, todayISO: string): number {
  const today = new Date(todayISO + "T00:00:00Z").getTime();
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** Human label for an exam countdown. */
export function examCountdownLabel(days: number): string {
  if (days < 0) return "exam passed";
  if (days === 0) return "exam today";
  if (days === 1) return "exam tomorrow";
  if (days <= 30) return `${days} days to exam`;
  const weeks = Math.round(days / 7);
  return `${weeks} weeks to exam`;
}

/** Short countdown for an assignment / deadline due date. */
export function dueLabel(days: number): string {
  if (days < 0) return "overdue";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  if (days <= 14) return `${days} days left`;
  return `${Math.round(days / 7)} weeks left`;
}
