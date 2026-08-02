import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { daysUntil } from "@/lib/dates";
import { todayISO } from "@/lib/planService";
import { coursePassed } from "@/lib/coursePassed";
import CourseCard, {
  confidenceFromHealth,
  type CourseHealth,
  type HealthStatus,
} from "@/components/CourseCard";
import SwipeCourseCard from "@/components/SwipeCourseCard";
import MarkPassedButton from "@/components/MarkPassedButton";
import type { Translator } from "@/components/i18n/messages";
import { BookOpen, GraduationCap } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { getT } from "@/components/i18n/server";
import { isSyllabusAIEnabled } from "@/lib/syllabus";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Courses",
  description: "All your modules at a glance: exam countdowns, progress, and what needs attention next.",
};

/** A realistic daily study budget (minutes) — matches the planner's "~3 h/day". */
const DAILY_BUDGET_MIN = 180;

/**
 * Derive a course's health from signals the page already computes. Order matters
 * — the first matching rule wins, so the most urgent state always shows:
 *   1. noPlan     — no study blocks exist yet (nothing to do until a plan is built)
 *   2. examSoon   — exam is in the next 7 days (and work still remains)
 *   3. overloaded — finishing needs more than ~3 h/day before the exam
 *   4. attention  — moderate per-day load, or untouched topics with the exam near
 *   5. healthy    — none of the above (comfortably on track, or already done)
 */
function deriveHealth(
  t: Translator,
  {
    examInDays,
    remainingMinutes,
    untouched,
    hasPlan,
  }: { examInDays: number; remainingMinutes: number; untouched: number; hasPlan: boolean },
): CourseHealth {
  const daysLeft = Math.max(examInDays, 0);
  // Spread remaining work over the days left (today counts), in hours/day.
  const perDayHours = remainingMinutes / 60 / Math.max(daysLeft, 1);
  const remainingHours = Math.round(remainingMinutes / 60);
  const workLeft = remainingMinutes > 0;

  let status: HealthStatus;
  if (!hasPlan) status = "noPlan";
  else if (examInDays >= 0 && examInDays <= 7 && workLeft) status = "examSoon";
  else if (workLeft && remainingMinutes / 60 > (DAILY_BUDGET_MIN / 60) * Math.max(daysLeft, 1))
    status = "overloaded";
  else if (perDayHours * 60 > DAILY_BUDGET_MIN / 2 || (untouched > 0 && examInDays >= 0 && examInDays <= 21))
    status = "attention";
  else status = "healthy";

  // Build ONE calm health sentence from the same signals: a plain status lead,
  // an em-free " — ", then a couple of quiet facts joined by commas, ending in a
  // period. e.g. "Needs attention — 4 days left, 14h remaining."
  const lead =
    status === "healthy"
      ? t("courses.healthHealthy")
      : status === "attention"
        ? t("courses.healthAttention")
        : status === "overloaded"
          ? t("courses.healthOverloaded")
          : status === "noPlan"
            ? t("courses.healthNoPlan")
            : t("courses.healthExamSoon");

  const facts: string[] = [];
  facts.push(
    examInDays < 0 ? t("courses.whyExamPassed") : t.n("courses.whyDaysLeft", examInDays),
  );
  if (!hasPlan) {
    facts.push(t("courses.whyNoPlan"));
  } else if (workLeft) {
    facts.push(t("courses.whyRemaining", { hours: remainingHours }));
  } else {
    facts.push(t("courses.whyNoRemaining"));
  }
  if (untouched > 0) facts.push(t.n("courses.whyUntouched", untouched));
  if (status === "overloaded") {
    facts.push(t("courses.whyPerDay", { hours: Math.max(Math.round(perDayHours), 1) }));
  }

  const line = t("courses.healthLine", { lead, facts: facts.join(t("courses.whySep")) });

  // Refine the 5-state health into one calm confidence word (kept consistent with
  // Today's truth states). The same signals already drove `status`, so this is a
  // single deterministic mapping, not a parallel computation.
  const confidence = confidenceFromHealth(status);

  return { status, confidence, line };
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const userId = await getCurrentUserId();
  const t = await getT();
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: { examDate: "asc" },
    select: {
      id: true,
      name: true,
      examDate: true,
      // Passed-ness (bestanden / passing grade) moves a module off this list
      // onto /courses/passed.
      grade: true,
      passed: true,
      // Card only needs each topic's done flag (count + total) and each block's
      // completed/kind/minutes (remaining-study estimate) — not full records.
      topics: { select: { done: true } },
      blocks: { select: { completed: true, kind: true, minutes: true } },
    },
  });

  const today = todayISO();

  // Passed modules (bestanden / passing grade) live on their own page — this
  // list stays the active shelf, so finished modules never crowd out the work
  // that still has an exam coming.
  const active = courses.filter((c) => !coursePassed(c));
  const passedCount = courses.length - active.length;

  // The AI syllabus import is a development affordance when no provider is set:
  // outside dev with AI off we hide the entry point rather than send the user to
  // a disabled screen (manual add still covers the same need).
  const showImport = isSyllabusAIEnabled() || process.env.NODE_ENV !== "production";

  const emptyActions = [
    { label: t("courses.browseModules"), href: "/catalog" },
    ...(showImport ? [{ label: t("courses.importSyllabus"), href: "/courses/import" }] : []),
    { label: t("courses.addManually"), href: "/courses/new" },
  ];

  const passedLink = passedCount > 0 && (
    <Link
      href="/courses/passed"
      className="inline-flex items-center gap-2 rounded-xl bg-surface-muted px-4 py-3 text-sm font-medium text-gray-700 transition-colors hover:bg-accent dark:text-gray-200"
    >
      <GraduationCap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      {t("courses.passedLink", { count: passedCount })}
      <span aria-hidden="true">›</span>
    </Link>
  );

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8 lg:max-w-6xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("courses.title")}</h1>
        <Button asChild className="hidden shrink-0 lg:inline-flex">
          <Link href="/catalog">{t("courses.newCourse")}</Link>
        </Button>
      </div>

      {msg === "rate-limited" && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {t("courses.rateLimited")}
        </div>
      )}

      {courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-7 w-7" />}
          title={t("courses.emptyTitleActionable")}
          description={t("courses.emptyDescActionable")}
          actions={emptyActions}
        />
      ) : active.length === 0 ? (
        // Every module is passed: a quiet congratulation, not the "add your
        // first course" empty state — the courses exist, they're just done.
        <div className="rounded-2xl bg-surface-muted p-6 text-center">
          <p className="text-base font-medium text-gray-700 dark:text-gray-200">
            {t("courses.allPassed")}
          </p>
          <div className="mt-4 flex justify-center">{passedLink}</div>
        </div>
      ) : (
        <>
          <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 xl:grid-cols-3">
            {active.map((c) => {
              const done = c.topics.filter((t) => t.done).length;
              const completedBlocks = c.blocks.filter((b) => b.completed).length;
              const remainingMinutes = c.blocks
                .filter((b) => !b.completed && b.kind === "study")
                .reduce((s, b) => s + b.minutes, 0);
              const examInDays = daysUntil(c.examDate, today);
              const health = deriveHealth(t, {
                examInDays,
                remainingMinutes,
                untouched: c.topics.length - done,
                hasPlan: c.blocks.length > 0,
              });
              return (
                <li key={c.id}>
                  <SwipeCourseCard
                    courseId={c.id}
                    courseName={c.name}
                    progressCount={done + completedBlocks}
                  >
                    {/* The mark-passed overlay is a SIBLING of the card's link
                        (never nested in the anchor): desktop's one-click
                        "Modul bestanden", revealed on hover — touch has the
                        swipe instead. Bottom-right, where the old pill sat. */}
                    <div className="group/card relative">
                      <CourseCard
                        t={t}
                        course={{
                          id: c.id,
                          name: c.name,
                          examDate: c.examDate.toISOString().slice(0, 10),
                          examInDays,
                          health,
                        }}
                      />
                      <div className="absolute bottom-3 right-3">
                        <MarkPassedButton courseId={c.id} courseName={c.name} />
                      </div>
                    </div>
                  </SwipeCourseCard>
                </li>
              );
            })}
          </ul>

          {passedLink && <div className="mt-6">{passedLink}</div>}
        </>
      )}
    </main>
  );
}
