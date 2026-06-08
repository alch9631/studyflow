import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { examCountdownLabel } from "@/lib/dates";
import { lpOf } from "@/lib/stats";
import { getStatsCached } from "@/lib/statsCache";
import EmptyState from "@/components/EmptyState";
import { panelClass } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Insights",
  description: "Your study streak, weekly consistency, and grade average across every module.",
};

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export default async function InsightsPage() {
  const userId = await getCurrentUserId();
  const stats = await getStatsCached(userId, todayISO());

  const {
    hasData,
    currentStreak: streak,
    loggedMinutes,
    weekPlanned,
    weekDone,
    weekPct,
    dueTotal,
    dueDone,
    duePct,
    consistency,
    activeDays,
    upcomingWorkload,
    completedModules,
    attention,
    courses,
  } = stats;
  const { gpa, lpEarned } = stats.grades;
  const graded = courses.filter((c) => c.grade != null);

  // Last 7 days of completed study minutes (for a small activity chart).
  const last7 = stats.dailyLoad;
  const maxDay = Math.max(60, ...last7.map((x) => x.min));

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">📊 Insights</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        How your studying is actually going.
      </p>

      {!hasData ? (
        <EmptyState
          emoji="📊"
          title="No study data yet"
          description="Add a course and check off some sessions — your streak, progress, and grades will all appear here."
          actions={[
            { label: "🎓 Browse TUHH modules", href: "/catalog" },
            { label: "📚 My courses", href: "/courses", variant: "secondary" },
          ]}
        />
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
                {attention.map(({ id, name, topicsTotal, topicsDone, apple, days }) => (
                  <li key={id}>
                    <Link
                      href={`/courses/${id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {topicsDone}/{topicsTotal} topics · {examCountdownLabel(days)}
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
            <section className={`${panelClass} mt-6 p-5`}>
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
          <section className={`${panelClass} mt-6 p-5`}>
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
          <section className={`${panelClass} mt-6 p-5`}>
            <h2 className="mb-3 font-semibold">Last 7 days</h2>
            <div className="flex items-end justify-between gap-2" style={{ height: "96px" }}>
              {last7.map((d) => (
                <div key={d.key} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
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
                const total = c.topicsTotal;
                const done = c.topicsDone;
                const pct = c.progressPct;
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
    <div className={`${panelClass} p-4`}>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}
