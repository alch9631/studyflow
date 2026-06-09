/**
 * Centralized defensive limits + guard helpers.
 *
 * Every "how much can a user create / how big can a payload be" number lives
 * here so the caps are easy to find and tune in one place. The server actions
 * and API routes import these and check them BEFORE the Prisma write, so a user
 * can't create unbounded data or push an oversized payload at the database.
 *
 * Guards throw `ValidationError` (from validate.ts) on breach — the same error
 * the rest of the input layer throws — so `handleApiError` turns them into a
 * clean 400 and server actions can catch + redirect like they already do.
 *
 * Dependency-light (only `ValidationError`) so it's safe to import anywhere.
 */
import { ValidationError } from "./validate";

/**
 * Per-user / per-course count caps. Generous enough that a real student never
 * trips them, low enough that a runaway script can't fill the DB.
 */
export const LIMITS = {
  /** Max courses a single user may own. */
  MAX_COURSES_PER_USER: 100,
  /** Max topics a single course may hold. */
  MAX_TOPICS_PER_COURSE: 500,
  /** Max recurring weekly class slots a user may have. */
  MAX_LECTURES_PER_USER: 200,
  /** Max assignments (deliverables) a single course may hold. */
  MAX_ASSIGNMENTS_PER_COURSE: 500,
  /** Max catalog modules added in one "add from catalog" submit. */
  MAX_CATALOG_ADD_BATCH: 100,
  /** Max push subscriptions a single user may register. */
  MAX_PUSH_SUBSCRIPTIONS_PER_USER: 50,
  /** Max length of a single topic note (free-text scratchpad). */
  MAX_NOTE_LENGTH: 10_000,

  /** Max raw bytes accepted for a JSON/API request body. */
  MAX_REQUEST_BODY_BYTES: 1_000_000, // 1 MB
  /** Max length of a single bounded string field in an API body. */
  MAX_FIELD_LENGTH: 2_000,
} as const;

export type LimitKey = keyof typeof LIMITS;

/**
 * Throw if creating one more record would exceed `max`.
 *
 *   guardCount(await prisma.course.count({ where: { userId } }),
 *              LIMITS.MAX_COURSES_PER_USER, "courses");
 *
 * `current` is the existing row count; the guard assumes the caller is about to
 * add ONE more, so it rejects when `current >= max`.
 */
export function guardCount(current: number, max: number, label: string): void {
  if (current >= max) {
    throw new ValidationError(
      `You've reached the maximum of ${max} ${label}. Delete some before adding more.`,
    );
  }
}

/**
 * Throw if adding `adding` more records would push `current` past `max`.
 * Use when a single action creates several rows at once (e.g. a course's topics,
 * a catalog batch).
 */
export function guardCountBy(
  current: number,
  adding: number,
  max: number,
  label: string,
): void {
  if (current + adding > max) {
    throw new ValidationError(
      `That would exceed the maximum of ${max} ${label}. Reduce the amount and try again.`,
    );
  }
}
