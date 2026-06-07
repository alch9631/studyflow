import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { appleFor } from "@/lib/apple";
import { daysUntil, examCountdownLabel } from "@/lib/dates";

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
      select: {
        date: true,
        minutes: true,
        completed: true,
        actualMinutes: true,
        kind: true,
        courseId: true,
      },
    }),
    prisma.course.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        grade: true,
        ects: true,
        examDate: true,
        intense: true,
        topics: { select: { done: true } },
      },
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

  // Last 7 days of completed study minutes (for a small activity chart).
  const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() - (6 - i) * 86400_000);
    return { key: dayKey(d), label: DOW[d.getUTCDay()], min: 0 };
  });
  const last7Map = new Map(last7.map((x) => [x.key, x]));
  for (const b of blocks) {
    if (!b.completed) continue;
    const slot = last7Map.get(dayKey(b.date));
    if (slot) slot.min += b.minutes;
  }
  const maxDay = Math.max(60, ...last7.map((x) => x.min));

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

  // Notenschnitt — LP-weighted average over graded courses (German 1.0–5.0).
  const graded = courses.filter((c) => c.grade != null);
  const lpOf = (c: { ects: number | null }) => c.ects ?? 6;
  const gradedLp = graded.reduce((s, c) => s + lpOf(c), 0);
  const gpa = gradedLp
    ? graded.reduce((s, c) => s + (c.grade as number) * lpOf(c), 0) / gradedLp
    : null;
  // LP earned = graded courses with a passing grade (<= 4.0).
  const lpEarned = graded.filter((c) => (c.grade as number) <= 4.0).reduce((s, c) => s + lpOf(c), 0);

  // Completed modules (every topic done).
  const completedModules = courses.filter(
    (c) => c.topics.length > 0 && c.topics.every((t) => t.done)
  ).length;

  // Upcoming workload — uncompleted study/review minutes scheduled in next 7 days.
  const weekAhead = new Date(today.getTime() + 7 * 86400_000);
  const upcomingWorkload = blocks
    .filter((b) => !b.completed && b.date >= today && b.date < weekAhead)
    .reduce((s, b) => s + b.minutes, 0);

  // Consistency — share of the last 14 days with at least one completed block.
  let activeDays = 0;
  for (let i = 0; i < 14; i++) {
    if (completedDays.has(dayKey(new Date(today.getTime() - i * 86400_000)))) activeDays++;
  }
  const consistency = Math.round((activeDays / 14) * 100);

  // Needs attention — unfinished courses, most urgent first (apple priority).
  const remainingByCourse = new Map<string, number>();
  for (const b of blocks) {
    if (!b.completed && b.kind === "study") {
      remainingByCourse.set(b.courseId, (remainingByCourse.get(b.courseId) ?? 0) + b.minutes);
    }
  }
  const RANK: Record<string, number> = { High: 0, Medium: 1, "On track": 2 };
  const attention = courses
    .map((c) => {
      const total = c.topics.length;
      const done = c.topics.filter((t) => t.done).length;
      const apple = appleFor({
        examDate: c.examDate,
        intense: c.intense,
        remainingMinutes: remainingByCourse.get(c.id) ?? 0,
      });
      return { c, total, done, apple, days: daysUntil(c.examDate, todayISO()) };
    })
    .filter((x) => x.total === 0 || x.done < x.total) // not finished
    .filter((x) => x.days >= 0) // exam not past
    .sort((a, b) => (RANK[a.apple.label] ?? 3) - (RANK[b.apple.label] ?? 3) || a.days - b.days)
    .slice(0, 3);

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
            <Stat label="📅 Consistency" value={`${consistency}%`} sub={`${activeDays}/14 days active`} />
            <Stat label="📚 Next 7 days" value={fmtMin(upcomingWorkload)} sub="study planned" />
            <Stat label="🎓 Modules done" value={`${completedModules}`} sub={`of ${courses.length}`} />
          </div>

          {/* Needs attention — what to focus on next */}
          {attention.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 font-semibold">Needs attention</h2>
              <ul className="space-y-2">
                {attention.map(({ c, total, done, apple, days }) => (
                  <li key={c.id}>
                    <Link
                      href={`/courses/${c.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{c.name}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {done}/{total} topics · {examCountdownLabel(days)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${apple.cls}`}
                      >
                        {apple.emoji} {apple.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Grades — Notenschnitt over graded courses */}
          {graded.length > 0 && (
            <section className="mt-6 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">🎓 Grades</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {graded.length} graded
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-8">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Notenschnitt</div>
                  <div className="text-2xl font-bold tabular-nums">{gpa!.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">LP earned</div>
                  <div className="text-2xl font-bold tabular-nums">{lpEarned}</div>
                </div>
              </div>
              <ul className="mt-4 space-y-1.5">
                {graded.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                    <Link href={`/courses/${c.id}`} className="truncate hover:underline">
                      {c.name}
                    </Link>
                    <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                      {(c.grade as number).toFixed(1)} · {lpOf(c)} LP
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

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

          {/* Last 7 days activity */}
          <section className="mt-6 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
            <h2 className="mb-3 font-semibold">Last 7 days</h2>
            <div className="flex items-end justify-between gap-2" style={{ height: "96px" }}>
              {last7.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {d.min > 0 ? fmtMin(d.min) : ""}
                  </span>
                  <div
                    className={`w-full rounded-t ${d.min > 0 ? "bg-brand" : "bg-gray-100 dark:bg-gray-800"}`}
                    style={{ height: `${Math.max(4, Math.round((d.min / maxDay) * 72))}px` }}
                    title={`${d.label}: ${fmtMin(d.min)}`}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{d.label}</span>
                </div>
              ))}
            </div>
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
