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
  /** "study" = first-pass learning, "review" = spaced-repetition recall. */
  kind: "study" | "review";
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
 * Effort as a finite, non-negative number. The DB columns are typed non-null,
 * but real-world drift (legacy rows, partial migrations, hand-edited data) can
 * hand us null/NaN. Coercing here keeps NaN out of every downstream sum/ratio so
 * the engine degrades gracefully instead of emitting malformed blocks.
 */
function effortOf(effort: number | null | undefined): number {
  return Number.isFinite(effort as number) ? Math.max(effort as number, 0) : 0;
}

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
  studyDays: number[] | null | undefined,
): string[] {
  const start = new Date(startISO + "T00:00:00Z");
  const end = new Date(endISO + "T00:00:00Z");
  const days = studyDays ?? [];
  const dates: string[] = [];
  // Invalid/missing dates yield NaN getTime(), so the loop simply produces no
  // dates rather than throwing.
  for (let t = start.getTime(); t < end.getTime(); t += MS_PER_DAY) {
    const d = new Date(t);
    if (days.includes(d.getUTCDay())) {
      dates.push(d.toISOString().slice(0, 10));
    }
  }
  return dates;
}

/** A single focused session length — keeps blocks Pomodoro-friendly and enables interleaving. */
export const SESSION_MINUTES = 30;

/**
 * Spread topics across the study dates, weighted by effort, but INTERLEAVED:
 * each day rotates through the pending topics in ~30-min sessions rather than
 * finishing one topic before starting the next. Interleaving is evidence-backed
 * (forces the brain to differentiate concepts) and naturally mixes courses too.
 */
function distribute(
  topics: Topic[],
  dates: string[],
  minutesPerDay: number,
  completedByTopic: Record<string, number> = {},
): StudyBlock[] {
  if (dates.length === 0 || topics.length === 0) return [];

  const totalEffort = topics.reduce((s, t) => s + effortOf(t.effort), 0);
  if (totalEffort <= 0) return [];

  const dailyCap = Number.isFinite(minutesPerDay) ? Math.max(minutesPerDay, 0) : 0;
  if (dailyCap <= 0) return [];
  const totalMinutes = dates.length * dailyCap;
  // Minutes still owed per topic (fair share of total time, by effort), MINUS
  // any minutes already studied on that topic. Subtracting completed work here
  // means we only ever schedule what's LEFT to do — falling behind reshapes the
  // remainder, it doesn't re-litigate sessions the student already checked off.
  // (The completed sessions themselves are preserved by the caller.)
  const remaining = topics.map((t) => {
    const target = Math.round((effortOf(t.effort) / totalEffort) * totalMinutes);
    const fairShare = target > 0 ? target : 15;
    const done = Math.max(completedByTopic[t.id] ?? 0, 0);
    return { t, m: Math.max(0, fairShare - done) };
  });

  const blocks: StudyBlock[] = [];
  let ti = 0; // round-robin cursor across topics

  for (const date of dates) {
    let cap = dailyCap;
    while (cap > 0) {
      if (!remaining.some((r) => r.m > 0)) break;
      // Next topic (from ti) that still owes time.
      let pick: (typeof remaining)[number] | null = null;
      for (let k = 0; k < remaining.length; k++) {
        const r = remaining[(ti + k) % remaining.length];
        if (r.m > 0) {
          pick = r;
          ti = (ti + k + 1) % remaining.length;
          break;
        }
      }
      if (!pick) break;
      const chunk = Math.min(SESSION_MINUTES, pick.m, cap);
      blocks.push({
        date,
        topicId: pick.t.id,
        topicTitle: pick.t.title,
        minutes: chunk,
        completed: false,
        kind: "study",
      });
      pick.m -= chunk;
      cap -= chunk;
    }
  }

  // Ran out of days with work left → pile the remainder on the last day (visible
  // overload, never dropped).
  const last = dates[dates.length - 1];
  for (const r of remaining) {
    if (r.m > 0) {
      blocks.push({
        date: last,
        topicId: r.t.id,
        topicTitle: r.t.title,
        minutes: r.m,
        completed: false,
        kind: "study",
      });
      r.m = 0;
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
  completedMinutesByTopic: Record<string, number> | null | undefined,
  plannedMinutesByTopic: Record<string, number> | null | undefined,
): Course {
  const completed = completedMinutesByTopic ?? {};
  const plannedAll = plannedMinutesByTopic ?? {};
  return {
    ...course,
    topics: (course.topics ?? []).map((t) => {
      const planned = Number.isFinite(plannedAll[t.id]) ? plannedAll[t.id] : 0;
      const done = Number.isFinite(completed[t.id]) ? completed[t.id] : 0;
      if (done <= 0 || planned <= 0) return t;
      const remainingFraction = Math.max(0, 1 - done / planned);
      // Nothing left to do for this topic — let it drop out of the plan.
      if (remainingFraction <= 0) return { ...t, done: true };
      return { ...t, effort: effortOf(t.effort) * remainingFraction };
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
  opts?: { calibration?: number },
): { blocks: StudyBlock[]; minutesPerDay: number; intense: boolean } {
  const dates = studyDatesBetween(todayISO, course.examDate, course.studyDays);
  const pending = (course.topics ?? []).filter((t) => !t.done);
  const totalEffort = pending.reduce((s, t) => s + effortOf(t.effort), 0);

  if (dates.length === 0 || totalEffort <= 0) {
    return { blocks: [], minutesPerDay: 0, intense: dates.length === 0 && totalEffort > 0 };
  }

  // calibration scales the time estimate from the student's actual pace (≈1 by default).
  const factor = opts?.calibration && opts.calibration > 0 ? opts.calibration : 1;
  const totalMinutes = Math.ceil(totalEffort * MINUTES_PER_EFFORT * factor);
  // The pace needed to finish everything across the available study days.
  const minutesPerDay = Math.max(15, Math.ceil(totalMinutes / dates.length));
  const study = distribute(pending, dates, minutesPerDay);
  const reviews = buildReviewBlocks(study, dates);
  return {
    blocks: [...study, ...reviews],
    minutesPerDay,
    intense: minutesPerDay > INTENSE_MINUTES_PER_DAY,
  };
}

/** Shift an ISO date by n calendar days. */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Minutes for a spaced-repetition review session. */
export const REVIEW_MINUTES = 25;

/** How hard the student found a topic — drives how much review it earns. */
export type Difficulty = "easy" | "medium" | "hard";

/**
 * Spaced-repetition intervals (days after the last study session) per perceived
 * difficulty. Harder → MORE reviews at TIGHTER, earlier spacing (you forget hard
 * material faster, so you revisit it sooner and more often); easier → fewer,
 * later. Unrated topics behave exactly like "medium" — the original [1,3,7] — so
 * difficulty is purely additive and a plan with no ratings is byte-for-byte the
 * plan we generated before this feature. Kept bounded (≤4 reviews) so a wall of
 * hard topics can't flood the schedule.
 */
export const REVIEW_INTERVALS_BY_DIFFICULTY: Record<Difficulty, number[]> = {
  hard: [1, 2, 4, 7], // 4 reviews, earlier first touch
  medium: [1, 3, 7], // unchanged baseline (== unrated)
  easy: [3, 10], // 2 reviews, later — you already retain it
};

/** The baseline schedule used for unrated topics (identical to pre-difficulty behavior). */
const DEFAULT_REVIEW_INTERVALS = REVIEW_INTERVALS_BY_DIFFICULTY.medium;

function intervalsForDifficulty(d: Difficulty | null | undefined): number[] {
  return d ? REVIEW_INTERVALS_BY_DIFFICULTY[d] : DEFAULT_REVIEW_INTERVALS;
}

/**
 * Spaced repetition: after a topic's last study session, schedule short recall
 * reviews at EXPANDING intervals, snapped to the next study day and kept before
 * the exam. This is the #1 evidence-backed retention lever.
 *
 * `difficultyByTopic` (optional) tunes the spacing PER topic from how hard the
 * student found it: hard topics get more/earlier reviews, easy fewer/later, and
 * anything unrated keeps the original [1,3,7] — so passing `{}` (or nothing)
 * reproduces the pre-difficulty plan exactly (no regression).
 */
export function buildReviewBlocks(
  study: StudyBlock[] | null | undefined,
  dates: string[],
  difficultyByTopic: Record<string, Difficulty> = {},
): StudyBlock[] {
  if (dates.length === 0) return [];
  const lastByTopic = new Map<string, { date: string; title: string }>();
  for (const b of study ?? []) {
    const cur = lastByTopic.get(b.topicId);
    if (!cur || b.date > cur.date) lastByTopic.set(b.topicId, { date: b.date, title: b.topicTitle });
  }

  const reviews: StudyBlock[] = [];
  for (const [topicId, { date, title }] of lastByTopic) {
    const intervals = intervalsForDifficulty(difficultyByTopic[topicId]);
    const used = new Set<string>();
    for (const iv of intervals) {
      const target = addDaysISO(date, iv);
      const slot = dates.find((d) => d >= target); // next study day on/after target
      if (slot && slot > date && !used.has(slot)) {
        used.add(slot);
        reviews.push({
          date: slot,
          topicId,
          topicTitle: title,
          minutes: REVIEW_MINUTES,
          completed: false,
          kind: "review",
        });
      }
    }
  }
  return reviews;
}

/** Build a fresh plan for a course, starting from `todayISO`. */
export function generatePlan(course: Course, todayISO: string): StudyBlock[] {
  const dates = studyDatesBetween(todayISO, course.examDate, course.studyDays);
  const pending = (course.topics ?? []).filter((t) => !t.done);
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
  /**
   * Minutes already studied per topic id (from completed study blocks). Heal
   * subtracts this so it redistributes only the work that's LEFT — falling
   * behind reshapes the remainder, it doesn't re-litigate what you've done.
   */
  completedByTopic: Record<string, number> = {},
): { blocks: StudyBlock[]; isOverloaded: boolean } {
  const dates = studyDatesBetween(todayISO, course.examDate, course.studyDays);

  // A topic is "done" if flagged done on the course; partial progress is folded
  // in via completedByTopic (minutes already studied), subtracted below.
  const pending = (course.topics ?? []).filter((t) => !t.done);
  const blocks = distribute(pending, dates, course.minutesPerDay, completedByTopic);

  // Overload = can the days left even hold a minimum-viable amount per topic?
  // Judged against the floor for the work that REMAINS (minus minutes already
  // studied), NOT the spread plan (which always "fits" because it scales to
  // available time).
  const requiredMinutes = pending.reduce((s, t) => {
    const floor = effortOf(t.effort) * MIN_MINUTES_PER_EFFORT;
    const done = Math.max(completedByTopic[t.id] ?? 0, 0);
    return s + Math.max(0, floor - done);
  }, 0);
  const dailyCap = Number.isFinite(course.minutesPerDay) ? Math.max(course.minutesPerDay, 0) : 0;
  const availableMinutes = dates.length * dailyCap;
  const isOverloaded = requiredMinutes > availableMinutes;

  return { blocks, isOverloaded };
}
