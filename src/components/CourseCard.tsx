import Link from "next/link";
import { buttonClasses } from "./ui";
import { Card } from "./ui/card";
import CourseCardMenu from "./CourseCardMenu";
import { examCountdownLabel, type Translator } from "./i18n/messages";

export type CardCourse = {
  id: string;
  name: string;
  examDate: string;
  examInDays: number;
  done: number;
  total: number;
  progressCount: number;
  apple: { emoji: string; label: string; cls: string };
};

/**
 * A whole course row is a single tap target → the course detail page (where you
 * update progress, edit settings, or delete). One `<Link>` wraps the card so the
 * entire surface is tappable with no nested interactive elements; the
 * "Update progress" pill is a visual affordance (aria-hidden) for that one link.
 *
 * The Course settings menu ({@link CourseCardMenu}) is the one exception: it's an
 * overlay rendered as a SIBLING of the Link (positioned absolute, top-right), so
 * it stays outside the anchor (valid HTML) and its trigger stops propagation so
 * opening the menu never navigates the card.
 */
export default function CourseCard({ course, t }: { course: CardCourse; t: Translator }) {
  const pct = course.total ? Math.round((course.done / course.total) * 100) : 0;

  return (
    <div className="relative">
      <Card
        asChild
        className="group block p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:shadow-md"
      >
        <Link
          href={`/courses/${course.id}`}
          aria-label={t("courses.openCard", { name: course.name })}
        >
        {/* Header: priority + name, exam date. Padded right so the long name
            never sits under the overlay menu trigger. */}
      <div className="flex flex-wrap items-start justify-between gap-2 pr-10">
        <div className="min-w-0">
          <span
            title={t("courses.priorityTitle", { label: course.apple.label })}
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${course.apple.cls}`}
          >
            {course.apple.emoji} {course.apple.label}
          </span>
          <span className="mt-1 block truncate text-base font-semibold group-hover:underline">
            {course.name}
          </span>
        </div>
        <span className="shrink-0 text-right">
          <span
            className={`block text-xs font-semibold ${
              course.examInDays < 0
                ? "text-gray-500 dark:text-gray-400"
                : course.examInDays <= 7
                  ? "text-red-600 dark:text-red-400"
                  : course.examInDays <= 21
                    ? "text-amber-700 dark:text-amber-400"
                    : "text-gray-600 dark:text-gray-300"
            }`}
          >
            ⏳ {examCountdownLabel(t, course.examInDays)}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">{course.examDate}</span>
        </span>
      </div>

      {/* Progress */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>

      {/* Footer: progress count + the single call to action */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t("courses.topicsDone", { done: course.done, total: course.total })}
        </span>
        <span aria-hidden="true" className={buttonClasses("primary", "md", "shrink-0")}>
          {t("courses.updateProgress")}
        </span>
      </div>
        </Link>
      </Card>

      {/* Overlay menu — sibling of the Link, never nested inside the anchor. */}
      <div className="absolute right-2 top-2">
        <CourseCardMenu courseId={course.id} courseName={course.name} progressCount={course.progressCount} />
      </div>
    </div>
  );
}
