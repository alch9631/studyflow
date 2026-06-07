import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";

export const dynamic = "force-dynamic";
export const metadata = { title: "Insights" };

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function InsightsPage() {
  const userId = await getCurrentUserId();

  const [blocks, courses] = await Promise.all([
    prisma.studyBlock.findMany({
      where: { course: { userId } },
      select: { date: true, minutes: true, completed: true, actualMinutes: true, courseId: true },
    }),
    prisma.course.findMany({
      where: { userId },
      select: { id: true, name: true, topics: { select: { done: true } } },
      orderBy: { examDate: "asc" },
    }),
  ]);

  const today = new Date(todayISO() + "T00:00:00Z");
  // Monday-based week start (UTC).
  const dow = today.getUTCDay(); // 0=Sun..6=Sat
  const weekStart = new Date(today.getTime() - ((dow + 6) % 7) * 86400_000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);

  let weekPlanned = 0;
  let weekDone = 0;
  let dueTotal = 0;
  let dueDone = 0;
  let loggedMinutes = 0;
  const completedDays = new Set<string>();

  for (const b of blocks) {
    if (b.actualMinutes) loggedMinutes += b.actualMinutes;
    if (b.date >= weekStart && b.date < weekEnd) {
      weekPlanned += b.minutes;
      if (b.completed) weekDone += b.minutes;
    }
    // "due" = scheduled on or before today
    if (b.date <= today) {
      dueTotal += b.minutes;
      if (b.completed) dueDone += b.minutes;
    }
    if (b.completed) completedDays.add(dayKey(b.date));
  }

  const weekPct = weekPlanned ? Math.round((weekDone / weekPlanned) * 100) : 0;
  const duePct = dueTotal ? Math.round((dueDone / dueTotal) * 100) : 0;

  // Streak: consecutive days (ending today or yesterday) with ≥1 completed block.
  let streak = 0;
  const cursor = new Date(today);
  if (!completedDays.has(dayKey(cursor))) {
    // allow streak to count if yesterday was active but today not yet studied
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  while (completedDays.has(dayKey(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const hasData = blocks.length > 0;

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-1 text-2xl font-bold">📊 Insights</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        How your studying is actually going.
      </p>

      {!hasData ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
          No study data yet. Add a course and check off some sessions on{" "}
          <Link href="/today" className="text-brand hover:underline">Today</Link> —
          your stats will appear here.
        </div>
      ) : (
        <>
          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="🔥 Streak" value={`${streak} ${streak === 1 ? "day" : "days"}`} />
            <Stat label="✅ Done when due" value={`${duePct}%`} sub={`${fmtMin(dueDone)} / ${fmtMin(dueTotal)}`} />
            <Stat label="⏱️ Focus logged" value={fmtMin(loggedMinutes)} />
          </div>

          {/* This week */}
          <section className="mt-6 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">This week</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {fmtMin(weekDone)} / {fmtMin(weekPlanned)}
              </span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: `${Math.min(weekPct, 100)}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {weekPlanned === 0
                ? "Nothing scheduled this week."
                : weekPct >= 100
                  ? "You're on top of this week. 🎉"
                  : `${weekPct}% of this week's plan done.`}
            </p>
          </section>

          {/* Per-course progress */}
          <section className="mt-6">
            <h2 className="mb-3 font-semibold">By course</h2>
            <ul className="space-y-2">
              {courses.map((c) => {
                const total = c.topics.length;
                const done = c.topics.filter((t) => t.done).length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <li
                    key={c.id}
                    className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/courses/${c.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                        {done}/{total} topics
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
              {courses.length === 0 && (
                <li className="text-sm text-gray-500 dark:text-gray-400">No courses yet.</li>
              )}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{sub}</div>}
    </div>
  );
}
