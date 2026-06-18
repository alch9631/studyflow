import Link from "next/link";
import { buttonClasses } from "./ui";
import { Card } from "./ui/card";
import CourseCardMenu from "./CourseCardMenu";
import { examCountdownLabel, type Translator } from "./i18n/messages";
import { formatFriendlyDate } from "@/lib/dates";

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
  /** The calm, plain-language confidence word (one word, not a scoreboard). */
  confidence: Confidence;
  /** Pre-localized one calm sentence, e.g. "Needs attention — 4 days left, 14h remaining." */
  line: string;
  /** Pre-localized next-action hint, e.g. "Build a plan →". */
  next: string;
};

/**
 * The plain-language plan confidence shown on a course — ONE calm word, kept
 * consistent with Today's truth states (protected / needs a choice / doesn't fit):
 *
 *   - "comfortable"  — on track; the runway comfortably holds the remaining work.
 *   - "tight"        — it fits, but with little slack (exam near, or a heavy but
 *                      survivable per-day pace) — true, not alarming.
 *   - "decision"     — it no longer fits without a change: overloaded, or there's
 *                      no plan yet. The honest "needs a decision" word.
 *
 * This is a refinement of the existing 5-state {@link HealthStatus}, not a parallel
 * system — {@link confidenceFromHealth} maps each health state to exactly one word
 * so the card shows a single calm signal instead of a five-way scoreboard.
 */
export type Confidence = "comfortable" | "tight" | "decision";

/**
 * Map the existing 5-state course health into one of the three calm confidence
 * words. Pure: same status → same word. The mapping deliberately mirrors Today:
 *   - overloaded / noPlan  → "decision"  (something must change / nothing planned)
 *   - examSoon / attention → "tight"     (fits, but the runway/workload is snug)
 *   - healthy              → "comfortable"
 */
export function confidenceFromHealth(status: HealthStatus): Confidence {
  switch (status) {
    case "overloaded":
    case "noPlan":
      return "decision";
    case "examSoon":
    case "attention":
      return "tight";
    case "healthy":
    default:
      return "comfortable";
  }
}

/** The i18n key for a confidence word's calm label. */
export function confidenceLabelKey(c: Confidence): "courses.confComfortable" | "courses.confTight" | "courses.confDecision" {
  return c === "comfortable"
    ? "courses.confComfortable"
    : c === "tight"
      ? "courses.confTight"
      : "courses.confDecision";
}

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
  // The single plain-language confidence word. "Needs a decision" gets the muted
  // amber accent (it asks for action); "Tight" and "Comfortable" stay neutral —
  // calm by default, never an alarm.
  const confidence = health.confidence;
  const confidenceLabel = t(confidenceLabelKey(confidence));

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
              <span className="block text-xs text-gray-400 dark:text-gray-500">
                {formatFriendlyDate(course.examDate, t.locale)}
              </span>
            </span>
          </div>

          {/* The single plain-language confidence word — ONE calm signal, kept
              consistent with Today (Comfortable · Tight · Needs a decision). Amber
              only when it asks for a decision; otherwise neutral. Not a scoreboard. */}
          <p
            className={`mt-3 text-sm font-semibold ${
              confidence === "decision"
                ? "text-warning-foreground"
                : "text-gray-700 dark:text-gray-200"
            }`}
          >
            {confidenceLabel}
          </p>

          {/* One calm health sentence — quiet words, not stacked alarm badges. */}
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{health.line}</p>

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
