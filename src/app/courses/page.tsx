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
          <Link href="/catalog">{t("courses.newCourse")}</Link>
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

    </main>
  );
}
