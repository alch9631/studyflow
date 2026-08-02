import Link from "next/link";
import { Card } from "./ui/card";
import { examCountdownLabel, type Translator } from "./i18n/messages";
import { formatFriendlyDate } from "@/lib/dates";

/**
 * One of five at-a-glance course states, derived server-side in
 * src/app/courses/page.tsx from existing signals (exam countdown, remaining
 * study minutes vs days left, untouched topics, whether a plan exists).
 *
 * Calm read: the card is a shelf row, not a dashboard — name, exam date, ONE
 * quiet health sentence (e.g. "Needs attention — 4 days left, 14h remaining.")
 * No progress bar, no topic-count badge, no competing priority pill — a single,
 * plain-language status surface. Passed modules never render here: they live on
 * their own /courses/passed page.
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
  health: CourseHealth;
};

/**
 * A whole course row is a single tap target → the course detail page (where you
 * update progress, edit settings, or delete). One `<Link>` wraps the card so the
 * entire surface is tappable with no nested interactive elements.
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
            3. ONE calm status sentence.
            No progress bar, no topic-count badge — nothing that turns the
            shelf into a scoreboard. */}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
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
      </Link>
    </Card>
  );
}
