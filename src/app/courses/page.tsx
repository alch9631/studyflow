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

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "My Courses",
  description: "All your modules at a glance — exam countdowns, progress, and what needs attention next.",
};

export default async function CoursesPage() {
  const userId = await getCurrentUserId();
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
        <h1 className="text-2xl font-bold tracking-tight">My Courses</h1>
        <Button asChild className="shrink-0">
          <Link href="/courses/new">+ New course</Link>
        </Button>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          emoji="📚"
          title="No courses yet"
          description="Pick how you want to start — StudyFlow builds the plan for you."
          actions={[
            { label: "🎓 Browse TUHH modules", href: "/catalog" },
            { label: "✨ Import a syllabus", href: "/courses/import" },
            { label: "✍️ Add manually", href: "/courses/new" },
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
                    course={{
                      id: c.id,
                      name: c.name,
                      examDate: c.examDate.toISOString().slice(0, 10),
                      examInDays: daysUntil(c.examDate, today),
                      done,
                      total: c.topics.length,
                      apple: { emoji: apple.emoji, label: apple.label, cls: apple.cls },
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
          ℹ️ How StudyFlow plans your studying
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Add your modules (manually, from the{" "}
            <Link href="/catalog" className="text-brand hover:underline">TUHH catalog</Link>, or by{" "}
            <Link href="/courses/import" className="text-brand hover:underline">uploading a syllabus/script</Link>).
          </li>
          <li>AI reads the content → topics, difficulty, and how long each takes.</li>
          <li>
            It works backward from your exam dates and spreads the work across all your
            courses within a realistic <strong>~3 h/day</strong> — never cramming one day.
          </li>
          <li>
            It adds <strong>spaced reviews</strong> and <strong>self-test questions</strong> for
            active recall — the proven ways to remember.
          </li>
          <li>
            Each day, open <Link href="/today" className="text-brand hover:underline">Today</Link> for
            exactly what to study; tell it your progress and it re-plans around you.
          </li>
        </ol>
        <p className="mt-3 border-t border-gray-200 dark:border-gray-800 pt-2">
          <strong>🍎 Apple priority:</strong> each course is rated by urgency (exam soon) and
          workload — <span className="font-medium text-green-700 dark:text-green-400">🍏 On track</span>,
          <span className="font-medium text-yellow-800 dark:text-yellow-300"> 🟡 Medium</span>,
          <span className="font-medium text-red-700 dark:text-red-400"> 🍎 High</span>. Red = focus here first.
        </p>
      </details>
    </main>
  );
}
