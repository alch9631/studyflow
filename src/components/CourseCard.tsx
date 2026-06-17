import Link from "next/link";
import { buttonClasses } from "./ui";
import { Card } from "./ui/card";
import CourseCardMenu from "./CourseCardMenu";
import { examCountdownLabel, type Translator } from "./i18n/messages";

/**
 * One of five at-a-glance course states, derived server-side in
 * src/app/courses/page.tsx from existing signals (exam countdown, remaining
 * study minutes vs days left, untouched topics, whether a plan exists). It
 * answers "what do I do with this course?" via a badge, a one-line "why", and a
 * next-action hint.
 */
export type HealthStatus =
  | "healthy"
  | "attention"
  | "overloaded"
  | "noPlan"
  | "examSoon";

export type CourseHealth = {
  status: HealthStatus;
  /** Pre-localized one-liner, e.g. "4d left · 17h remaining · 5 topics untouched". */
  why: string;
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
  apple: { emoji: string; label: string; cls: string };
  health: CourseHealth;
};

/** Badge color + emoji per status. Mirrors the apple badge's pill styling. */
const HEALTH_STYLE: Record<HealthStatus, { emoji: string; cls: string }> = {
  healthy: { emoji: "✅", cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  attention: { emoji: "⚠️", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  overloaded: { emoji: "🔥", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
  noPlan: { emoji: "🗂️", cls: "bg-gray-100 text-gray-600 dark:bg-gray-700/40 dark:text-gray-300" },
  examSoon: { emoji: "⏰", cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
};

const HEALTH_LABEL_KEY: Record<HealthStatus, Parameters<Translator>[0]> = {
  healthy: "courses.healthHealthy",
  attention: "courses.healthAttention",
  overloaded: "courses.healthOverloaded",
  noPlan: "courses.healthNoPlan",
  examSoon: "courses.healthExamSoon",
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
  const healthStyle = HEALTH_STYLE[health.status];
  const healthLabel = t(HEALTH_LABEL_KEY[health.status]);

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
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              title={t("courses.priorityTitle", { label: course.apple.label })}
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${course.apple.cls}`}
            >
              {course.apple.emoji} {course.apple.label}
            </span>
            <span
              title={t("courses.healthTitle", { label: healthLabel })}
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${healthStyle.cls}`}
            >
              {healthStyle.emoji} {healthLabel}
            </span>
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

      {/* The "why" — a one-line readout of the signals behind the status badge. */}
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{health.why}</p>

      {/* Footer: progress count + the next-action call to action */}
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
