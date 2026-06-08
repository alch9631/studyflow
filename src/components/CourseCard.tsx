import Link from "next/link";
import { examCountdownLabel } from "@/lib/dates";
import { buttonClasses, cardClass } from "./ui";

export type CardCourse = {
  id: string;
  name: string;
  examDate: string;
  examInDays: number;
  done: number;
  total: number;
  apple: { emoji: string; label: string; cls: string };
};

/**
 * A whole course row is a single tap target → the course detail page (where you
 * update progress, edit settings, or delete). One `<Link>` wraps the card so the
 * entire surface is tappable with no nested interactive elements; the
 * "Update progress" pill is a visual affordance (aria-hidden) for that one link.
 */
export default function CourseCard({ course }: { course: CardCourse }) {
  const pct = course.total ? Math.round((course.done / course.total) * 100) : 0;

  return (
    <Link
      href={`/courses/${course.id}`}
      aria-label={`${course.name} — open to update progress`}
      className={`group block ${cardClass} p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:shadow-md`}
    >
      {/* Header: priority + name, exam date */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span
            title={`${course.apple.label} priority`}
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
                ? "text-gray-400 dark:text-gray-500"
                : course.examInDays <= 7
                  ? "text-red-600 dark:text-red-400"
                  : course.examInDays <= 21
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-gray-600 dark:text-gray-300"
            }`}
          >
            ⏳ {examCountdownLabel(course.examInDays)}
          </span>
          <span className="block text-xs text-gray-400 dark:text-gray-500">{course.examDate}</span>
        </span>
      </div>

      {/* Progress */}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>

      {/* Footer: progress count + the single call to action */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {course.done}/{course.total} topics done
        </span>
        <span aria-hidden="true" className={buttonClasses("primary", "md", "shrink-0")}>
          Update progress →
        </span>
      </div>
    </Link>
  );
}
