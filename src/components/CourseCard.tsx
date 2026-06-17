import Link from "next/link";
import { buttonClasses } from "./ui";
import { Card } from "./ui/card";
import CourseCardMenu from "./CourseCardMenu";
import { examCountdownLabel, type Translator } from "./i18n/messages";

/**
 * One of five at-a-glance course states, derived server-side in
 * src/app/courses/page.tsx from existing signals (exam countdown, remaining
 * study minutes vs days left, untouched topics, whether a plan exists).
 *
 * Calm read: the card carries ONE quiet health sentence (e.g. "Needs attention
 * — 4 days left, 14h remaining.") and ONE next action. No stacked alarm badges,
 * no competing priority pill — a single, plain-language status surface.
 */
export type HealthStatus =
  | "healthy"
  | "attention"
  | "overloaded"
  | "noPlan"
  | "examSoon";

export type CourseHealth = {
  status: HealthStatus;
  /** Pre-localized one calm sentence, e.g. "Needs attention — 4 days left, 14h remaining." */
  line: string;
  /** Pre-localized next-action hint, e.g. "Build a plan →". */
  next: string;
};

export type CardCourse = {
  id: string;
  name: string;
  examDate: string;
  examInDays: number;
  done: number;
  total: number;
  progressCount: number;
  health: CourseHealth;
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
  const health = course.health;
  // One restrained urgency signal: the exam date itself, and only when it's
  // genuinely close (≤ 7 days). Everything else stays neutral — red is rare.
  const examUrgent = course.examInDays >= 0 && course.examInDays <= 7;

  return (
    <div className="relative">
      <Card
        asChild
        className="group block p-4 transition-colors hover:bg-gray-100 focus-visible:bg-gray-100 dark:hover:bg-gray-900 dark:focus-visible:bg-gray-900"
      >
        <Link
          href={`/courses/${course.id}`}
          aria-label={t("courses.openCard", { name: course.name })}
        >
          {/* Header: name + exam date. Padded right so the long name never sits
              under the overlay menu trigger. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 pr-10">
            <span className="min-w-0 truncate text-base font-semibold group-hover:underline">
              {course.name}
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`block text-xs font-medium ${
                  examUrgent
                    ? "text-red-600 dark:text-red-400"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {examCountdownLabel(t, course.examInDays)}
              </span>
              <span className="block text-xs text-gray-400 dark:text-gray-500">{course.examDate}</span>
            </span>
          </div>

          {/* Progress */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
          </div>

          {/* One calm health sentence — quiet words, not stacked alarm badges. */}
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{health.line}</p>

          {/* Footer: progress count + the single next action */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t("courses.topicsDone", { done: course.done, total: course.total })}
            </span>
            <span aria-hidden="true" className={buttonClasses("primary", "md", "shrink-0")}>
              {health.next}
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
