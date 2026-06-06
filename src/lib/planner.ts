/**
 * StudyFlow — the self-healing study plan engine.
 *
 * This is the heart of the product and deliberately framework-free:
 * pure functions, no DB, no React. Everything here is unit-testable in
 * isolation. The web app just feeds it data and renders the result.
 *
 * Core idea:
 *  - A Course has some amount of work (topics) and a deadline (exam date).
 *  - generatePlan() spreads that work across the available study days.
 *  - healPlan() re-spreads whatever is NOT done across the days that remain,
 *    so falling behind reshapes the plan instead of breaking it.
 */

export type Topic = {
  id: string;
  title: string;
  /** Relative effort weight. 1 = a normal chunk. Bigger = harder/longer. */
  effort: number;
  done: boolean;
};

export type StudyBlock = {
  date: string; // ISO date, e.g. "2026-06-10"
  topicId: string;
  topicTitle: string;
  /** Planned minutes for this block. */
  minutes: number;
  completed: boolean;
};

export type Course = {
  id: string;
  name: string;
  examDate: string; // ISO date
  topics: Topic[];
  /** Which weekdays the student can study (0 = Sun ... 6 = Sat). */
  studyDays: number[];
  /** Minutes available on a study day. */
  minutesPerDay: number;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The minimum minutes a topic of effort 1 realistically needs. Used to judge
 * whether the remaining days can hold the remaining work at all (overload),
 * independent of how the plan happens to spread the time.
 */
export const MIN_MINUTES_PER_EFFORT = 45;

/** Estimated total study minutes for a topic of effort 1 (a "normal" chunk). */
export const MINUTES_PER_EFFORT = 90;

/** Above this computed daily pace, finishing in time is unrealistic — flag it. */
export const INTENSE_MINUTES_PER_DAY = 360; // 6h/day

/** Inclusive list of ISO dates from `start` up to (not including) `end`. */
export function studyDatesBetween(
  startISO: string,
  endISO: string,
  studyDays: number[],
): string[] {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const dates: string[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += MS_PER_DAY) {
    const d = new Date(t);
    if (studyDays.includes(d.getUTCDay())) {
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

/**
 * Spread the given topics across the available study dates, weighted by effort.
 * Each topic may be split across multiple days if it doesn't fit in one.
 */
function distribute(
  topics: Topic[],
  dates: string[],
  minutesPerDay: number,
): StudyBlock[] {
  if (dates.length === 0 || topics.length === 0) return [];

  const totalEffort = topics.reduce((s, t) => s + Math.max(t.effort, 0), 0);
  if (totalEffort <= 0) return [];

  const totalMinutes = dates.length * minutesPerDay;
  const blocks: StudyBlock[] = [];

  // Minutes each day still has free.
  const capacity = dates.map(() => minutesPerDay);
  let cursor = 0;

  for (const topic of topics) {
    // Fair share of total study time for this topic.
    let remaining = Math.round((topic.effort / totalEffort) * totalMinutes);
    if (remaining <= 0) remaining = Math.min(minutesPerDay, 15);

    while (remaining > 0) {
      // Out of days: dump the remainder onto the last day rather than silently
      // dropping the topic. Fuller days = visible overload, not lost work.
      if (cursor >= dates.length) {
        const last = dates.length - 1;
        blocks.push({
          date: dates[last],
          topicId: topic.id,
          topicTitle: topic.title,
          minutes: remaining,
          completed: false,
        });
        remaining = 0;
        break;
      }
      if (capacity[cursor] <= 0) {
        cursor++;
        continue;
      }
      const chunk = Math.min(remaining, capacity[cursor]);
      blocks.push({
        date: dates[cursor],
        topicId: topic.id,
        topicTitle: topic.title,
        minutes: chunk,
        completed: false,
      });
      capacity[cursor] -= chunk;
      remaining -= chunk;
    }
  }

  return blocks;
}

/**
 * Fold completed sessions back into the course before a heal. Finished minutes
 * shouldn't be redistributed: a topic that's half-done carries only half its
 * effort into the next plan, and a fully-done topic drops out entirely. This
 * keeps healPlan/generatePlan pure — the caller supplies, per topic, how many
 * minutes are already planned and how many of those are done.
 */
export function applyCompletedWork(
  course: Course,
  completedMinutesByTopic: Record<string, number>,
  plannedMinutesByTopic: Record<string, number>,
): Course {
  return {
    ...course,
    topics: course.topics.map((t) => {
      const planned = plannedMinutesByTopic[t.id] ?? 0;
      const done = completedMinutesByTopic[t.id] ?? 0;
      if (done <= 0 || planned <= 0) return t;
      const remainingFraction = Math.max(0, 1 - done / planned);
      // Nothing left to do for this topic — let it drop out of the plan.
      if (remainingFraction <= 0) return { ...t, done: true };
      return { ...t, effort: t.effort * remainingFraction };
    }),
  };
}

/**
 * The right model: StudyFlow DECIDES the daily pace instead of asking the user.
 * Given the work (topics × effort) and the deadline (exam date over study days),
 * it computes how many minutes/day are needed to finish in time, then schedules
 * exactly that. `course.minutesPerDay` is ignored — the output `minutesPerDay`
 * is the recommended pace. `intense` flags a humanly-unrealistic pace (start
 * earlier / add study days), but we never tell the student to "trim topics".
 */
export function planForDeadline(
  course: Course,
  todayISO: string,
): { blocks: StudyBlock[]; minutesPerDay: number; intense: boolean } {
  const dates = studyDatesBetween(todayISO, course.examDate, course.studyDays);
  const pending = course.topics.filter((t) => !t.done);
  const totalEffort = pending.reduce((s, t) => s + Math.max(t.effort, 0), 0);

  if (dates.length === 0 || totalEffort <= 0) {
    return { blocks: [], minutesPerDay: 0, intense: dates.length === 0 && totalEffort > 0 };
  }

  const totalMinutes = Math.ceil(totalEffort * MINUTES_PER_EFFORT);
  // The pace needed to finish everything across the available study days.
  const minutesPerDay = Math.max(15, Math.ceil(totalMinutes / dates.length));
  const blocks = distribute(pending, dates, minutesPerDay);
  return { blocks, minutesPerDay, intense: minutesPerDay > INTENSE_MINUTES_PER_DAY };
}

/** Build a fresh plan for a course, starting from `todayISO`. */
export function generatePlan(course: Course, todayISO: string): StudyBlock[] {
  const dates = studyDatesBetween(todayISO, course.examDate, course.studyDays);
  const pending = course.topics.filter((t) => !t.done);
  return distribute(pending, dates, course.minutesPerDay);
}

/**
 * The differentiator. Given the existing plan and what's actually been done,
 * redistribute the *unfinished* work across the days that are LEFT — no guilt,
 * no broken schedule. If there's more work than time, days get fuller (we flag
 * it via isOverloaded) rather than silently dropping topics.
 */
export function healPlan(
  course: Course,
  todayISO: string,
): { blocks: StudyBlock[]; isOverloaded: boolean } {
  const dates = studyDatesBetween(todayISO, course.examDate, course.studyDays);

  // A topic is "done" if flagged done on the course. (Block-level completion
  // can be folded in by the caller before invoking heal.)
  const pending = course.topics.filter((t) => !t.done);
  const blocks = distribute(pending, dates, course.minutesPerDay);

  // Overload = can the days left even hold a minimum-viable amount per topic?
  // Judged against the floor, NOT the spread plan (which always "fits" because
  // it scales to available time).
  const requiredMinutes =
    pending.reduce((s, t) => s + Math.max(t.effort, 0), 0) *
    MIN_MINUTES_PER_EFFORT;
  const availableMinutes = dates.length * course.minutesPerDay;
  const isOverloaded = requiredMinutes > availableMinutes;

  return { blocks, isOverloaded };
}
