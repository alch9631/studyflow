// Small, dependency-free date helpers (safe to import in client components).

/** Whole days from `todayISO` (YYYY-MM-DD) to a date, in UTC. Negative = past. */
export function daysUntil(date: Date, todayISO: string): number {
  const today = new Date(todayISO + "T00:00:00Z").getTime();
  const target = new Date(date.toISOString().slice(0, 10) + "T00:00:00Z").getTime();
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
