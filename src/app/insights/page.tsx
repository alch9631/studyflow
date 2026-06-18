import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { lpOf } from "@/lib/stats";
import { getStatsCached } from "@/lib/statsCache";
import { prisma } from "@/lib/db";
import { instantToDayISO, DEFAULT_TZ } from "@/lib/calendarTime";
import { Sprout } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { WeeklyActivityChart, ConsistencyGauge, GradeTrendChart } from "@/components/InsightsCharts.lazy";
import { panelClass } from "@/components/ui";
import { getT } from "@/components/i18n/server";
import { examCountdownLabel, type MessageKey } from "@/components/i18n/messages";
import StudyHeatmap, { type HeatmapDay } from "./StudyHeatmap";
import { buildHeatmap } from "./heatmapData";

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
  const today = todayISO();
  const stats = await getStatsCached(userId, today);

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

  // Study heatmap — per-day completed minutes over the last 12 weeks, plus exam
  // dates so exam weeks can be highlighted. Read directly here (not via the stats
  // bundle) because the heatmap needs the raw completed blocks, day-bucketed in
  // Berlin time. Scoped to the window so it stays a cheap, bounded read.
  let heatmapDays: HeatmapDay[] = [];
  if (hasData) {
    // 13 weeks before today (a generous lower bound for the 12-week grid),
    // derived from the Berlin "today" so the read window stays deterministic.
    const since = new Date(new Date(today + "T00:00:00Z").getTime() - 13 * 7 * 86_400_000);
    const [hmBlocks, hmCourses] = await Promise.all([
      prisma.studyBlock.findMany({
        where: { course: { userId }, completed: true, date: { gte: since } },
        select: { date: true, minutes: true, completed: true },
      }),
      prisma.course.findMany({
        where: { userId },
        select: { examDate: true },
      }),
    ]);
    heatmapDays = buildHeatmap(
      hmBlocks,
      hmCourses.map((c) => c.examDate),
      today,
      DEFAULT_TZ,
      instantToDayISO,
    );
  }

  // ONE soft lead line — a single calm reflection, never a stacked report. We
  // pick the gentlest true sentence for where the day/week stands, leading with
  // an invitation rather than a verdict.
  let leadLine: string;
  if (loggedMinutes === 0 && dueDone === 0) {
    leadLine = t("insights.leadNoData");
  } else if (streak >= 3) {
    leadLine = t("insights.leadStreak", { days: streak });
  } else if (weekPlanned > 0 && weekPct >= 50) {
    leadLine = t("insights.leadOnTrack", { pct: weekPct });
  } else if (weekPlanned === 0) {
    leadLine = t("insights.leadWeekClear");
  } else {
    leadLine = t("insights.leadNextBlock");
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8 lg:max-w-5xl">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">{t("insights.title")}</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {t("insights.subtitle")}
      </p>

      {!hasData ? (
        <EmptyState
          icon={<Sprout className="h-7 w-7" />}
          title={t("insights.emptyTitle")}
          description={t("insights.emptyDesc")}
          actions={[
            { label: t("insights.browseModules"), href: "/catalog" },
            { label: t("insights.myCourses"), href: "/courses", variant: "secondary" },
          ]}
        />
      ) : (
        <>
          {/* ONE soft lead line — the calm "where you are" up top, an invitation
              rather than a verdict. */}
          <p className="mb-5 text-base text-gray-700 dark:text-gray-200">{leadLine}</p>

          {/* Rhythm — a quiet reflection on recent study, never a flame or a
              milestone to live up to. We surface "you studied recently" plus a
              gentle days-active fact; the all-time best is a soft aside, not a
              record to beat. Rested days read as calm, not as failure. */}
          <section
            aria-label={t("insights.rhythm")}
            className={`${panelClass} bg-surface-muted p-4 sm:p-5`}
          >
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {t("insights.rhythm")}
            </h2>
            <p className="mt-1 text-base text-gray-700 dark:text-gray-200">
              {streak > 0 ? t("insights.rhythmRecent") : t("insights.rhythmRested")}
            </p>
            {(activeDays > 0 || longestStreak > 1) && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {activeDays > 0 && t("insights.rhythmActiveDays", { days: activeDays })}
                {activeDays > 0 && longestStreak > 1 && " "}
                {longestStreak > 1 && t("insights.rhythmBest", { days: longestStreak })}
              </p>
            )}
          </section>

          {/* Everything number-heavy lives behind one quiet disclosure, so the
              page reads as reflection first and analysis only on request. Inside,
              the sections are calm nouns — Rhythm · Load · Recovery · Consistency —
              rather than a competitive scoreboard. */}
          <details className="group mt-6">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              {t("insights.details")}
              <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
            </summary>

            <div className="mt-4 space-y-6 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
          {/* Rhythm — recent study load, the day-by-day shape of the last week. */}
          <section className={`${panelClass} p-5`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">{t("insights.rhythm")}</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t("insights.last7days")}
              </span>
            </div>
            <div className="mt-3">
              <WeeklyActivityChart data={activity} />
            </div>
          </section>

          {/* Load — what's planned and what's due, framed as workload not a race.
              Headline figures + the closest courses to look at next. */}
          <section className="space-y-3 lg:col-span-2">
            <h2 className="font-semibold">{t("insights.load")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Stat label={t("insights.doneWhenDue")} value={`${duePct}%`} sub={`${fmtMin(dueDone)} / ${fmtMin(dueTotal)}`} />
              <Stat label={t("insights.focusLogged")} value={fmtMin(loggedMinutes)} />
              <Stat label={t("insights.next7days")} value={fmtMin(upcomingWorkload)} sub={t("insights.studyPlanned")} />
              <Stat label={t("insights.modulesDone")} value={`${completedModules}`} sub={t("insights.ofN", { count: courses.length })} />
            </div>

            {/* This week */}
            <div className={`${panelClass} p-5`}>
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{t("insights.thisWeek")}</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {fmtMin(weekDone)} / {fmtMin(weekPlanned)}
                </span>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-brand"
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
            </div>

            {/* Up next — quiet, judgment-free pointers to the closest courses */}
            {attention.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  {t("insights.upNext")}
                </h3>
                <ul className="space-y-2">
                  {attention.map(({ id, name, topicsTotal, topicsDone, days }) => (
                    <li key={id}>
                      <Link
                        href={`/courses/${id}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted p-3 transition-colors hover:bg-accent"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{name}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t("insights.topicsLabel", { done: topicsDone, total: topicsTotal })} · {examCountdownLabel(t, days)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Recovery — the 12-week shape of when you studied and rested, exam
              weeks gently marked. Rest reads as part of the rhythm, not a gap. */}
          {heatmapDays.length > 0 && (
            <section className={`${panelClass} p-5 lg:col-span-2`}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{t("insights.recovery")}</h2>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {t("insights.heatmapSub")}
                </span>
              </div>
              <div className="mt-4">
                <StudyHeatmap days={heatmapDays} />
              </div>
            </section>
          )}

          {/* Consistency — the gentle 14-day habit gauge, encouraging at any level. */}
          <section className={`${panelClass} p-5`}>
            <h2 className="font-semibold">{t("insights.consistency")}</h2>
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

          {/* Grades — Notenschnitt over graded courses */}
          {graded.length > 0 && (
            <section className={`${panelClass} p-5`}>
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

          {/* Per-course progress */}
          <section className="lg:col-span-2">
            <h2 className="mb-3 font-semibold">{t("insights.byCourse")}</h2>
            <ul className="space-y-2 sm:grid sm:grid-cols-2 sm:gap-2 sm:space-y-0 lg:grid-cols-3">
              {courses.map((c) => {
                const total = c.topicsTotal;
                const done = c.topicsDone;
                const pct = c.progressPct;
                return (
                  <li
                    key={c.id}
                    className="rounded-xl bg-surface-muted p-3"
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
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
            </div>
          </details>
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
