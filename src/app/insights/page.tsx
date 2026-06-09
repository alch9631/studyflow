import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { lpOf } from "@/lib/stats";
import { getStatsCached } from "@/lib/statsCache";
import EmptyState from "@/components/EmptyState";
import { StreakCard } from "@/components/StreakBadge";
import { WeeklyActivityChart, ConsistencyGauge, GradeTrendChart } from "@/components/InsightsCharts";
import { panelClass } from "@/components/ui";
import { getT } from "@/components/i18n/server";
import { examCountdownLabel, type MessageKey } from "@/components/i18n/messages";

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
  const t = await getT();
  const stats = await getStatsCached(userId, todayISO());

  const {
    hasData,
    currentStreak: streak,
    longestStreak,
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

  // Grade trend — graded courses in exam-date order (courses arrive sorted by
  // examDate asc), labelled by exam month so the line reads as "over time". The
  // `running` field is the LP-weighted Notenschnitt up to and including each
  // exam, so the overlay shows how the GPA itself drifted — not just the
  // individual marks. Weighting mirrors gradeSummary() in lib/stats.
  const gradeTrend = graded.map((c, i) => {
    const soFar = graded.slice(0, i + 1);
    const lp = soFar.reduce((s, x) => s + lpOf(x), 0);
    const running = lp
      ? soFar.reduce((s, x) => s + (x.grade as number) * lpOf(x), 0) / lp
      : (c.grade as number);
    return {
      label: c.examDate.toLocaleDateString(t.locale === "de" ? "de-DE" : "en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      }),
      grade: c.grade as number,
      running,
      full: c.name,
    };
  });

  // Last 7 days of completed study minutes (for the activity chart).
  const activity = stats.dailyLoad.map((d) => ({
    label: d.label,
    min: d.min,
    full: t(`charts.weekdays.${d.label}` as MessageKey),
  }));

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{t("insights.title")}</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {t("insights.subtitle")}
      </p>

      {!hasData ? (
        <EmptyState
          emoji="📊"
          title={t("insights.emptyTitle")}
          description={t("insights.emptyDesc")}
          actions={[
            { label: t("insights.browseModules"), href: "/catalog" },
            { label: t("insights.myCourses"), href: "/courses", variant: "secondary" },
          ]}
        />
      ) : (
        <>
          {/* Study streak — the headline habit metric */}
          <div className="mb-3">
            <StreakCard current={streak} best={longestStreak} t={t} />
          </div>

          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t("insights.doneWhenDue")} value={`${duePct}%`} sub={`${fmtMin(dueDone)} / ${fmtMin(dueTotal)}`} />
            <Stat label={t("insights.focusLogged")} value={fmtMin(loggedMinutes)} />
            <Stat label={t("insights.next7days")} value={fmtMin(upcomingWorkload)} sub={t("insights.studyPlanned")} />
            <Stat label={t("insights.modulesDone")} value={`${completedModules}`} sub={t("insights.ofN", { count: courses.length })} />
          </div>

          {/* Needs attention — what to focus on next */}
          {attention.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 font-semibold">{t("insights.needsAttention")}</h2>
              <ul className="space-y-2">
                {attention.map(({ id, name, topicsTotal, topicsDone, apple, days }) => (
                  <li key={id}>
                    <Link
                      href={`/courses/${id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 p-3 transition-colors hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {t("insights.topicsLabel", { done: topicsDone, total: topicsTotal })} · {examCountdownLabel(t, days)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${apple.cls}`}
                      >
                        {apple.emoji} {t(`apple.${apple.level}`)}
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
                <h2 className="font-semibold">{t("insights.grades")}</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t("insights.graded", { count: graded.length })}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-8">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t("insights.notenschnitt")}</div>
                  <div className="text-2xl font-bold tabular-nums">{gpa!.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t("insights.lpEarned")}</div>
                  <div className="text-2xl font-bold tabular-nums">{lpEarned}</div>
                </div>
              </div>
              {gradeTrend.length >= 2 && (
                <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-800">
                  <h3 className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                    {t("insights.gradeTrend")}
                  </h3>
                  <GradeTrendChart data={gradeTrend} average={gpa!} />
                </div>
              )}
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
              <h2 className="font-semibold">{t("insights.thisWeek")}</h2>
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
                ? t("insights.nothingThisWeek")
                : weekPct >= 100
                  ? t("insights.onTopWeek")
                  : t("insights.weekPctDone", { pct: weekPct })}
            </p>
          </section>

          {/* Activity & consistency — recent study load + the 14-day rhythm */}
          <section className={`${panelClass} mt-6 p-5`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{t("insights.last7days")}</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t("insights.completedStudyTime")}
              </span>
            </div>
            <div className="mt-3">
              <WeeklyActivityChart data={activity} />
            </div>
          </section>

          <section className={`${panelClass} mt-6 p-5`}>
            <h2 className="mb-1 font-semibold">{t("insights.consistency")}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("insights.consistencyHint")}
            </p>
            <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
              <ConsistencyGauge consistency={consistency} activeDays={activeDays} />
              <p className="text-center text-sm text-gray-600 dark:text-gray-300 sm:text-left">
                {consistency >= 80
                  ? t("insights.rockSolid", { days: activeDays })
                  : consistency >= 40
                    ? t("insights.steadyHabit", { days: activeDays })
                    : t("insights.smallSessions", { days: activeDays })}
              </p>
            </div>
          </section>

          {/* Per-course progress */}
          <section className="mt-6">
            <h2 className="mb-3 font-semibold">{t("insights.byCourse")}</h2>
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
                        {t("insights.topicsLabel", { done, total })}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
              {courses.length === 0 && (
                <li className="text-sm text-gray-500 dark:text-gray-400">{t("insights.noCourses")}</li>
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
