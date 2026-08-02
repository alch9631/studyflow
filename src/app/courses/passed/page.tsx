import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, GraduationCap } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { coursePassed } from "@/lib/coursePassed";
import { getT } from "@/components/i18n/server";
import EmptyState from "@/components/EmptyState";
import SwipeCourseCard from "@/components/SwipeCourseCard";
import { Card } from "@/components/ui/card";
import GradeQuickForm from "./GradeQuickForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Passed",
  description: "The modules you're done with, and their final grades.",
};

/**
 * The shelf of finished modules. Passed courses (bestanden flag or a passing
 * grade) live here, off the active My Courses list — a done module needs no
 * health sentence or exam countdown, just its name and a fast way to record
 * the final grade once it arrives.
 *
 * Swipes carry over from the active list: right undoes a pass, but only when
 * clearing the flag would genuinely re-open the module (a pass backed by a
 * passing grade is undone by editing the grade instead); left deletes with the
 * usual confirmation and returns here.
 */
export default async function PassedCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const userId = await getCurrentUserId();
  const t = await getT();
  const courses = await prisma.course.findMany({
    where: { userId },
    // Most recent exam first — the module you just finished is the one whose
    // grade you're about to enter.
    orderBy: { examDate: "desc" },
    select: {
      id: true,
      name: true,
      examDate: true,
      grade: true,
      passed: true,
      // Progress that deleting would destroy — drives the stronger warning in
      // the swipe-delete confirm. Filtered counts, not the full records.
      _count: {
        select: {
          topics: { where: { done: true } },
          blocks: { where: { completed: true } },
        },
      },
    },
  });
  const passed = courses.filter(coursePassed);

  // This page's archive spans semesters, so the exam date carries its year —
  // unlike the active list's near-term "Fri, Mar 15" countdown dates.
  const fmtExam = (d: Date) =>
    d.toLocaleDateString(t.locale === "de" ? "de-DE" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8 lg:max-w-6xl">
      <div className="mb-4">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("courseDetail.back")}
        </Link>
      </div>

      <h1 className="mb-1 text-2xl font-bold tracking-tight">{t("passedPage.title")}</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {t("passedPage.subtitle")}
      </p>

      {msg === "rate-limited" && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
        >
          {t("courses.rateLimited")}
        </div>
      )}

      {passed.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-7 w-7" />}
          title={t("passedPage.emptyTitle")}
          description={t("passedPage.emptyDesc")}
          actions={[{ label: t("courseDetail.back"), href: "/courses" }]}
        />
      ) : (
        <ul className="space-y-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0 xl:grid-cols-3">
          {passed.map((c) => (
            <li key={c.id}>
              <SwipeCourseCard
                courseId={c.id}
                courseName={c.name}
                passed
                // Undo only when clearing the FLAG genuinely re-opens the
                // module — a pass also backed by a passing grade stays passed,
                // so the swipe would just destroy the flag silently.
                canUndoPass={c.passed && !coursePassed({ grade: c.grade, passed: false })}
                progressCount={c._count.topics + c._count.blocks}
              >
                <Card className="p-4">
                  {/* The whole header block is the tap target into the course
                      (same card = tap pattern as the active list); only the
                      grade form below stays its own surface. */}
                  <Link
                    href={`/courses/${c.id}`}
                    aria-label={t("courses.openCard", { name: c.name })}
                    className="group block"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-base font-semibold group-hover:underline">
                        {c.name}
                      </span>
                      <span className="inline-block shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {t("courses.passedBadge")}
                      </span>
                    </div>
                    {/* Tense-neutral on purpose: a module can be marked passed
                        before its stored exam date. */}
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t("passedPage.examOn", { date: fmtExam(c.examDate) })}
                    </p>
                  </Link>

                  {/* The fast final-grade entry — the ONE thing left to do on a
                      passed module, so it sits right on the card. */}
                  <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                    <GradeQuickForm courseId={c.id} initialGrade={c.grade} />
                  </div>
                </Card>
              </SwipeCourseCard>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
