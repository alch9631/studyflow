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
 * Calm read: the card is a shelf row, not a dashboard — name, exam date, ONE
 * quiet health sentence (e.g. "Needs attention — 4 days left, 14h remaining.")
 * and ONE next action. No progress bar, no topic-count badge, no competing
 * priority pill — a single, plain-language status surface.
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
  /** Topics + completed blocks — used only by the settings menu's delete confirm. */
  progressCount: number;
  health: CourseHealth;
};

/**
 * A whole course row is a single tap target → the course detail page (where you
 * update progress, edit settings, or delete). One `<Link>` wraps the card so the
 * entire surface is tappable with no nested interactive elements; the next-action
 * pill is a visual affordance (aria-hidden) for that one link.
 *
 * The Course settings menu ({@link CourseCardMenu}) is the one exception: it's an
 * overlay rendered as a SIBLING of the Link (positioned absolute, top-right), so
 * it stays outside the anchor (valid HTML) and its trigger stops propagation so
 * opening the menu never navigates the card.
 */
export default function CourseCard({ course, t }: { course: CardCourse; t: Translator }) {
  const health = course.health;
  // A course is "action-needed" only when the calm status itself asks for action
  // (exam soon, overloaded, needs attention, no plan). That single signal — and
  // nothing else — earns the muted amber accent on the exam countdown. Everything
  // else stays neutral slate; red is never used here.
  const actionNeeded = health.status !== "healthy";

  return (
    <div className="relative">
      <Card
        asChild
        className="group block p-4 transition-colors hover:bg-accent focus-visible:bg-accent"
      >
        <Link
          href={`/courses/${course.id}`}
          aria-label={t("courses.openCard", { name: course.name })}
        >
          {/* A shelf row, not a dashboard. Hierarchy, top to bottom:
              1. course name   2. exam date / countdown
              3. ONE calm status sentence   4. ONE next action.
              No progress bar, no topic-count badge — nothing that turns the
              shelf into a scoreboard. Padded right so the long name never sits
              under the overlay menu trigger. */}
          <div className="flex flex-wrap items-baseline justify-between gap-2 pr-10">
            <span className="min-w-0 truncate text-base font-semibold group-hover:underline">
              {course.name}
            </span>
            <span className="shrink-0 text-right">
              <span
                className={`block text-xs font-medium ${
                  actionNeeded
                    ? "text-warning-foreground"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {examCountdownLabel(t, course.examInDays)}
              </span>
              <span className="block text-xs text-gray-400 dark:text-gray-500">{course.examDate}</span>
            </span>
          </div>

          {/* One calm health sentence — quiet words, not stacked alarm badges. */}
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{health.line}</p>

          {/* Footer: the single next action. Teal when there's something to do;
              quiet (secondary) once the course is comfortably on track. */}
          <div className="mt-3 flex justify-end">
            <span
              aria-hidden="true"
              className={buttonClasses(actionNeeded ? "primary" : "secondary", "md", "shrink-0")}
            >
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
