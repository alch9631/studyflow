import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { appleFor } from "@/lib/apple";
import { daysUntil } from "@/lib/dates";
import { todayISO } from "@/lib/planService";
import CourseCard from "@/components/CourseCard";
import SwipeCourseCard from "@/components/SwipeCourseCard";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { getT } from "@/components/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Courses",
  description: "All your modules at a glance — exam countdowns, progress, and what needs attention next.",
};

export default async function CoursesPage() {
  const userId = await getCurrentUserId();
  const t = await getT();
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: { examDate: "asc" },
    select: {
      id: true,
      name: true,
      examDate: true,
      studyDays: true,
      intense: true,
      // Card only needs each topic's done flag (count + total) and each block's
      // completed/kind/minutes (remaining-study estimate) — not full records.
      topics: { select: { done: true } },
      blocks: { select: { completed: true, kind: true, minutes: true } },
    },
  });

  const today = todayISO();

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("courses.title")}</h1>
        <Button asChild className="hidden shrink-0 lg:inline-flex">
          <Link href="/courses/new">{t("courses.newCourse")}</Link>
        </Button>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          emoji="📚"
          title={t("courses.emptyTitle")}
          description={t("courses.emptyDesc")}
          actions={[
            { label: t("courses.browseModules"), href: "/catalog" },
            { label: t("courses.importSyllabus"), href: "/courses/import" },
            { label: t("courses.addManually"), href: "/courses/new" },
          ]}
        />
      ) : (
        <ul className="space-y-3">
          {courses.map((c) => {
            const done = c.topics.filter((t) => t.done).length;
            const remainingMinutes = c.blocks
              .filter((b) => !b.completed && b.kind === "study")
              .reduce((s, b) => s + b.minutes, 0);
            const apple = appleFor({
              examDate: c.examDate,
              intense: c.intense,
              remainingMinutes,
            });
            return (
              <li key={c.id}>
                <SwipeCourseCard courseId={c.id} courseName={c.name}>
                  <CourseCard
                    t={t}
                    course={{
                      id: c.id,
                      name: c.name,
                      examDate: c.examDate.toISOString().slice(0, 10),
                      examInDays: daysUntil(c.examDate, today),
                      done,
                      total: c.topics.length,
                      apple: { emoji: apple.emoji, label: t(`apple.${apple.level}`), cls: apple.cls },
                    }}
                  />
                </SwipeCourseCard>
              </li>
            );
          })}
        </ul>
      )}

      {/* Explanation moved to the bottom */}
      <details className="mt-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-4 text-sm text-gray-600 dark:text-gray-300">
        <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200">
          {t("courses.howTitle")}
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            {t("courses.how1Pre")}{" "}
            <Link href="/catalog" className="text-brand hover:underline">{t("courses.how1Catalog")}</Link>{t("courses.how1Mid")}{" "}
            <Link href="/courses/import" className="text-brand hover:underline">{t("courses.how1Upload")}</Link>{t("courses.how1Post")}
          </li>
          <li>{t("courses.how2")}</li>
          <li>
            {t("courses.how3Pre")} <strong>{t("courses.how3Strong")}</strong> {t("courses.how3Post")}
          </li>
          <li>
            {t("courses.how4Pre")} <strong>{t("courses.how4Spaced")}</strong> {t("courses.how4Mid")}{" "}
            <strong>{t("courses.how4SelfTest")}</strong> {t("courses.how4Post")}
          </li>
          <li>
            {t("courses.how5Pre")} <Link href="/today" className="text-brand hover:underline">{t("courses.how5Today")}</Link>{" "}
            {t("courses.how5Post")}
          </li>
        </ol>
        <p className="mt-3 border-t border-gray-200 dark:border-gray-800 pt-2">
          <strong>{t("courses.appleTitle")}</strong> {t("courses.appleBody")}{" "}
          <span className="font-medium text-green-700 dark:text-green-400">{t("courses.appleOnTrack")}</span>,
          <span className="font-medium text-yellow-800 dark:text-yellow-300"> {t("courses.appleMedium")}</span>,
          <span className="font-medium text-red-700 dark:text-red-400"> {t("courses.appleHigh")}</span>{t("courses.appleTail")}
        </p>
      </details>
    </main>
  );
}
