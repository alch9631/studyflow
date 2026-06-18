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

/**
 * Friendly, localized day label from a YYYY-MM-DD calendar date — e.g.
 * "Sun, Jun 21" (en) / "So., 21. Juni" (de) — instead of a raw ISO string.
 *
 * The input is read as a UTC calendar date (dates are persisted at UTC midnight
 * and the app's day keys are plain YYYY-MM-DD), and formatted in UTC so the day
 * never shifts under a local timezone. Accepts a full ISO string too; only the
 * leading date part matters. Returns the input unchanged if it isn't a valid
 * date, so a bad value degrades to the raw string rather than "Invalid Date".
 */
export function formatFriendlyDate(iso: string, locale: "en" | "de"): string {
  const day = iso.slice(0, 10);
  const d = new Date(day + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale === "de" ? "de-DE" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
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
