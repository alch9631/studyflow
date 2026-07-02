import { prisma } from "./db";
import {
  applyCompletedWork,
  buildReviewBlocks,
  studyDatesBetween,
  difficultyMultiplier,
  MINUTES_PER_EFFORT,
  REVIEW_MINUTES,
  SESSION_MINUTES,
  type Course as EngineCourse,
  type StudyBlock as EngineBlock,
  type Difficulty,
} from "./planner";
import { isSyllabusAIEnabled, optimizeStudyPlan, generateSelfTests } from "./syllabus";

/**
 * Realistic MAX total study time per day across ALL of a student's courses. This
 * is now a CEILING, not a target: the scheduler paces each course to its exam
 * (see TARGET pace below) and only fills up to this cap when several courses
 * overlap. Raised to ~6h so the even-spread plan (multiple courses, each touched
 * a little every study day) fits the student's real Mon–Fri capacity instead of
 * being squeezed into 3h and front-packed.
 */
export const GLOBAL_DAILY_MINUTES = 360; // ~6h ceiling
/**
 * Cap on one topic's time in a single day. Lowered so a substantial topic is
 * TOUCHED ACROSS SEVERAL DAYS (progressing over time) instead of being finished
 * in one or two sittings — the per-topic half of the "spread, don't cram" goal.
 */
const MAX_TOPIC_MINUTES_PER_DAY = 45;
/**
 * Smallest study block we'll emit. When a course's even pace is below this (a
 * light course over a long runway), we don't sprinkle sub-minute slivers on every
 * day — we accrue the pace as "credit" and spend it as a real block once it
 * reaches this floor, which SPACES sessions out across the runway instead of
 * front-loading them. Sized below a full session so even modest pacing still
 * lands several sessions a week.
 */
const MIN_BLOCK_MINUTES = 15;
/**
 * Safety bound on how far ahead we ever schedule. A pathological far-future exam
 * (years out) would otherwise make studyDatesBetween enumerate an enormous date
 * list; we cap the runway each course is spread over to keep the rebuild bounded.
 */
const MAX_SCHEDULE_DAYS = 400;
/** Even on a heavy lecture day, still allow at least this much study time. */
export const MIN_DAILY_AFTER_LECTURES = 30;

/**
 * Study dates from `start` to the exam, capped at MAX_SCHEDULE_DAYS so a
 * far-future exam can't enumerate an unbounded list. The cap only bites on
 * pathological horizons (>~400 study days); normal courses are unaffected and
 * still spread across their entire real runway.
 */
const runwayDates = (start: string, exam: string, days: number[]) =>
  studyDatesBetween(start, exam, days).slice(0, MAX_SCHEDULE_DAYS);

/**
 * Hard bound on a stored topic's effort before it becomes minutes. Efforts are
 * clamped where they enter the system (AI parse / form validation), but bad
 * PERSISTED data (legacy rows, hand-edited DB) must not be able to break every
 * future rebuild: effort = Infinity would flow through
 * `Math.ceil(effort * MINUTES_PER_EFFORT * …)` straight into a createMany with
 * `minutes: Infinity`. Defense-in-depth next to the parse-boundary clamp.
 */
export const MAX_TOPIC_EFFORT = 100;

/** Effort as a finite value in [0, MAX_TOPIC_EFFORT]; junk coerces to 0. */
export function clampEffort(effort: number | null | undefined): number {
  if (!Number.isFinite(effort as number)) return 0;
  return Math.min(Math.max(effort as number, 0), MAX_TOPIC_EFFORT);
}

/**
 * The study-time ceiling for one weekday, AFTER that day's lectures are
 * subtracted from the global daily cap. A class-heavy day leaves less room to
 * study; a free day keeps the full ceiling. Never drops below
 * {@link MIN_DAILY_AFTER_LECTURES} (even a fully-booked day allows a little
 * study) and never exceeds {@link GLOBAL_DAILY_MINUTES}. `lectureMinutes` is the
 * total lecture minutes on that weekday; null/NaN/negative drift coerces to 0 so
 * a bad timetable row can't inflate or break the budget. Pure so the
 * timetable-awareness invariant is unit-testable without a DB.
 */
export function dailyStudyCeiling(lectureMinutes: number | null | undefined): number {
  const busy = Number.isFinite(lectureMinutes as number) ? Math.max(lectureMinutes as number, 0) : 0;
  return Math.max(MIN_DAILY_AFTER_LECTURES, GLOBAL_DAILY_MINUTES - busy);
}

/**
 * Today as an ISO date (YYYY-MM-DD) in the student's timezone (Europe/Berlin).
 * Using UTC here caused a late-night off-by-one (after midnight local but still
 * "yesterday" in UTC), shifting Today + the schedule by a day.
 */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(new Date());
}

type DbCourseWithTopics = {
  id: string;
  name: string;
  examDate: Date;
  studyDays: string;
  minutesPerDay: number;
  difficulty?: number;
  topics: { id: string; title: string; effort: number; done: boolean }[];
};

type DbBlock = {
  topicId: string;
  topicTitle: string;
  date: Date;
  minutes: number;
  completed: boolean;
  /** "study" | "review". Optional for drift-tolerance; missing → "study". */
  kind?: string;
};

/**
 * Stable identity for a session, so completion survives a wipe-and-recreate.
 * Keyed by topicId (not title) so two same-titled topics can't collide — a
 * title collision would make persistBlocks silently drop one topic's planned
 * minutes as "already covered". Includes `kind` so a scheduled "review" can't
 * collide with a completed "study" block on the same topic+date.
 */
export const blockKey = (topicId: string, date: Date, kind: string) =>
  `${topicId}|${date.toISOString().slice(0, 10)}|${kind}`;

/**
 * Fold per-session completion into the course the engine sees: a topic with
 * finished sessions carries less (or zero) effort into the next plan, so heal
 * doesn't redistribute work the student already did.
 *
 * Only STUDY blocks count: reviews are short recall sessions layered ON TOP of
 * a topic's study effort, so counting them as planned/done study minutes would
 * make a topic with all study finished but reviews pending look part-unstudied
 * and get its study re-scheduled from scratch on heal/rebuild.
 */
export function foldCompletedSessions(
  course: DbCourseWithTopics & { blocks: DbBlock[] },
): EngineCourse {
  const planned: Record<string, number> = {};
  const done: Record<string, number> = {};
  for (const b of course.blocks ?? []) {
    // Reviews don't carry study effort; missing kind (drift) folds as "study",
    // matching the schema default.
    if ((b.kind ?? "study") !== "study") continue;
    // Guard against null/NaN minutes from DB drift so a single bad row can't
    // poison a topic's planned/done totals (and ultimately its folded effort).
    const minutes = Number.isFinite(b.minutes) ? b.minutes : 0;
    planned[b.topicId] = (planned[b.topicId] ?? 0) + minutes;
    if (b.completed) done[b.topicId] = (done[b.topicId] ?? 0) + minutes;
  }
  return applyCompletedWork(toEngineCourse(course), done, planned);
}

/** Student confidence → review difficulty. Struggling earns more/earlier reviews
 *  (treated like a "hard" topic); solid fewer/later ("easy"); unrated stays
 *  baseline (absent from the map). */
const CONFIDENCE_TO_DIFFICULTY: Record<string, Difficulty> = {
  struggling: "hard",
  practice: "medium",
  solid: "easy",
};

/** Build the per-topic review-difficulty map from each topic's self-rated
 *  confidence (replaces the per-session difficulty signal). */
export function reviewDifficultyByTopic(
  topics: { id: string; confidence: string | null }[],
): Record<string, Difficulty> {
  const out: Record<string, Difficulty> = {};
  for (const tp of topics) {
    const d = tp.confidence ? CONFIDENCE_TO_DIFFICULTY[tp.confidence] : undefined;
    if (d) out[tp.id] = d;
  }
  return out;
}

/** Map a persisted course into the shape the pure engine expects. */
export function toEngineCourse(c: DbCourseWithTopics): EngineCourse {
  // The DB columns are typed non-null, but we defend against drift (legacy rows,
  // partial migrations) here at the boundary so the pure engine always receives
  // clean, finite values and never has to second-guess its inputs.
  return {
    id: c.id,
    name: c.name ?? "",
    examDate: c.examDate ? c.examDate.toISOString().slice(0, 10) : "",
    minutesPerDay: Number.isFinite(c.minutesPerDay) ? c.minutesPerDay : 0,
    // Pass the raw rating through; the engine coerces null/out-of-range to the
    // normal multiplier (1.0), so a missing/legacy value plans as the baseline.
    difficulty: c.difficulty,
    studyDays: (c.studyDays ?? "")
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
    topics: (c.topics ?? []).map((t) => ({
      id: t.id,
      title: t.title ?? "",
      effort: Number.isFinite(t.effort) ? t.effort : 0,
      done: t.done === true,
    })),
  };
}

async function persistBlocks(courseId: string, blocks: EngineBlock[]) {
  // Completed sessions are durable history — never wipe them. We rebuild only
  // the unfinished plan, and skip any freshly-planned block that lands on a
  // topic+date a completed session already covers (matching on topic+date).
  // Atomic swap: a crash between the delete and the create must never leave a
  // course with no plan, so everything runs in ONE interactive transaction —
  // including the snapshot read: read outside it, a block completed in between
  // would survive the delete AND get a duplicate fresh row created.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.studyBlock.findMany({
      where: { courseId },
      select: {
        completed: true,
        topicId: true,
        date: true,
        kind: true,
        startTime: true,
        endTime: true,
      },
    });
    const completedKeys = new Set(
      existing.filter((b) => b.completed).map((b) => blockKey(b.topicId, b.date, b.kind)),
    );
    // Hand-set clock times on unfinished blocks survive the wipe-and-recreate:
    // a re-created block matching an existing timed uncompleted block (same
    // topic+date+kind) inherits its startTime/endTime, honouring
    // autoScheduleWeekTimes' promise to never stomp times the student set.
    const timesByKey = new Map<string, { startTime: Date; endTime: Date }>();
    for (const b of existing) {
      if (b.completed || b.startTime == null || b.endTime == null) continue;
      const key = blockKey(b.topicId, b.date, b.kind);
      if (!timesByKey.has(key)) timesByKey.set(key, { startTime: b.startTime, endTime: b.endTime });
    }
    const fresh = blocks.filter(
      (b) => !completedKeys.has(blockKey(b.topicId, new Date(b.date + "T00:00:00Z"), b.kind)),
    );
    await tx.studyBlock.deleteMany({ where: { courseId, completed: false } });
    if (fresh.length > 0) {
      await tx.studyBlock.createMany({
        data: fresh.map((b) => {
          const date = new Date(b.date + "T00:00:00Z");
          const key = blockKey(b.topicId, date, b.kind);
          // First fresh block per key only: a topic can earn two chunks on one
          // day, and both inheriting the same clock slot would overlap.
          const times = timesByKey.get(key);
          if (times) timesByKey.delete(key);
          return {
            courseId,
            topicId: b.topicId,
            topicTitle: b.topicTitle,
            date,
            minutes: b.minutes,
            completed: false,
            kind: b.kind,
            startTime: times?.startTime ?? null,
            endTime: times?.endTime ?? null,
          };
        }),
      });
    }
  });
}

/**
 * Adaptive estimate (planning fallacy): if the student has logged actual time
 * (via the Pomodoro timer), learn whether they study faster/slower than the
 * estimate and scale future plans. Clamped, and only once there's enough data.
 */
export function calibrationFromHistory(
  blocks: { minutes: number; actualMinutes: number | null; completed: boolean }[],
): number {
  // Only COMPLETED sessions are evidence of pace: an abandoned sprint has
  // actual < planned by construction, so counting it would read as "student is
  // faster than the estimate" and shrink the plan for work never finished.
  const logged = blocks.filter((b) => b.completed && b.actualMinutes && b.actualMinutes > 0);
  if (logged.length < 3) return 1;
  const planned = logged.reduce((s, b) => s + b.minutes, 0);
  const actual = logged.reduce((s, b) => s + (b.actualMinutes ?? 0), 0);
  if (planned <= 0) return 1;
  return Math.min(2.5, Math.max(0.5, actual / planned));
}

/**
 * Fit freshly-built review blocks under the global daily ceiling. Reviews used
 * to be persisted without touching `dayLoad`, so they stacked on top of the
 * ~6h cap without bound. Each review now counts toward its day's load, and one
 * whose target day is already full slides to the NEXT study day with room
 * (still before the exam — `dates` is the runway — and still at most one
 * recall of a topic per day). If no later day has room it keeps its original
 * slot: a short recall is never dropped, so a genuinely crowded run-up can
 * still exceed the ceiling by at most these 25-min sessions.
 */
export function fitReviews(
  reviews: EngineBlock[],
  dates: string[],
  dayLoad: Map<string, number>,
  ceilingFor: (date: string) => number,
): EngineBlock[] {
  // Days each topic already reviews on, so a slide can't create a same-day dup.
  const usedByTopic = new Map<string, Set<string>>();
  for (const r of reviews) {
    const used = usedByTopic.get(r.topicId) ?? new Set<string>();
    used.add(r.date);
    usedByTopic.set(r.topicId, used);
  }
  const out: EngineBlock[] = [];
  for (const r of reviews) {
    const used = usedByTopic.get(r.topicId)!;
    let slot = r.date;
    if ((dayLoad.get(slot) ?? 0) + r.minutes > ceilingFor(slot)) {
      const later = dates.find(
        (d) => d > r.date && !used.has(d) && (dayLoad.get(d) ?? 0) + r.minutes <= ceilingFor(d),
      );
      if (later) {
        used.delete(r.date);
        used.add(later);
        slot = later;
      }
    }
    dayLoad.set(slot, (dayLoad.get(slot) ?? 0) + r.minutes);
    out.push(slot === r.date ? r : { ...r, date: slot });
  }
  return out;
}

type Work = {
  courseId: string;
  topicId: string;
  title: string;
  rem: number; // minutes still to schedule
  /** Topic's position in the course (order asc); drives early/late interleaving. */
  order: number;
  exam: string; // ISO date
  studyDays: number[];
};

/**
 * One course's day-by-day pacing state. We pre-compute a TARGET per-study-day
 * budget (≈ remaining work / remaining study days) so the course's work is
 * spread evenly across its whole runway to the exam instead of front-packed into
 * the first few days. The day loop never gives a course more than this target on
 * a normal day, so a course with a long runway gets a little every study day and
 * still has study/review near the exam.
 */
type CoursePace = {
  courseId: string;
  exam: string;
  studyDays: number[];
  /** Topics of this course still owing time, in course order. */
  work: Work[];
  /** Even-spread minutes/day to finish exactly on time (>= a one-session floor). */
  targetPerDay: number;
};

/**
 * Per-user serialization of the global rebuild. Every confidence tap / topic
 * toggle triggers a full delete-and-recreate of that user's unfinished plan; on
 * rapid taps those overlap, racing the same rows (and on SQLite, contending for
 * the write lock → SQLITE_BUSY). We chain rebuilds for a given user so they run
 * one after another instead of concurrently. Each link still runs its OWN fresh
 * rebuild AFTER the previous finishes, so it always reads post-write data — no
 * coalescing that could miss a write, no correctness regression. In-process only
 * (single-instance deployment); it bounds the thundering herd from one user's
 * optimistic taps without changing what any single rebuild computes.
 */
const rebuildChain = new Map<string, Promise<unknown>>();

export function rebuildSchedule(
  userId: string,
): Promise<Map<string, { isOverloaded: boolean; minutesPerDay: number }>> {
  const prev = rebuildChain.get(userId) ?? Promise.resolve();
  // Run after any in-flight rebuild for this user (ignoring its outcome), so two
  // rapid taps don't delete+recreate the same rows at the same time.
  const next = prev.catch(() => {}).then(() => rebuildScheduleInner(userId));
  rebuildChain.set(userId, next);
  // Clean up once we're the tail of the chain, so the map doesn't grow forever.
  void next.finally(() => {
    if (rebuildChain.get(userId) === next) rebuildChain.delete(userId);
  });
  return next;
}

/**
 * GLOBAL realistic scheduler — EVEN-SPREAD edition.
 *
 * Plans ALL of a student's courses together, but instead of front-packing the
 * earliest days to a fixed daily budget, it PACES each course evenly to its exam:
 * each course gets a target ≈ remainingWork / remainingStudyDays, so a subject is
 * present a little on every study day across the whole runway (steady study the
 * whole way, not a wall of work up front and an empty tail). Within a course,
 * topics are interleaved in course order so foundational topics lead and later
 * topics follow, each touched across several days rather than crammed into one.
 *
 * A global daily CEILING (`GLOBAL_DAILY_MINUTES`, ~6h, minus the day's lectures)
 * still bounds the total so overlapping courses can't exceed a realistic day; on
 * such crowded days, nearer exams win the contested minutes. Work that genuinely
 * cannot fit before its exam is piled onto the last study day (never dropped) and
 * the course is flagged `intense`.
 */
async function rebuildScheduleInner(
  userId: string,
): Promise<Map<string, { isOverloaded: boolean; minutesPerDay: number }>> {
  const courses = await prisma.course.findMany({
    where: { userId },
    // Only the fields the scheduler reads: course identity/pace + each topic's
    // effort/done + each block's completion (folding) and logged time (calibration).
    select: {
      id: true,
      name: true,
      examDate: true,
      studyDays: true,
      minutesPerDay: true,
      difficulty: true,
      topics: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, effort: true, done: true, confidence: true },
      },
      blocks: {
        select: {
          topicId: true,
          topicTitle: true,
          date: true,
          minutes: true,
          completed: true,
          kind: true,
          actualMinutes: true,
        },
      },
    },
  });

  // Timetable awareness: total lecture minutes per weekday, so a day busy with
  // classes gets a smaller study budget (no over-scheduling on heavy class days).
  const lectures = await prisma.lecture.findMany({
    where: { userId },
    select: { weekday: true, startMin: true, endMin: true },
  });
  const lectureMinByDow = [0, 0, 0, 0, 0, 0, 0];
  for (const l of lectures) {
    lectureMinByDow[l.weekday] += Math.max(0, l.endMin - l.startMin);
  }

  const today = todayISO();
  // Courses the scheduler could not fully fit before their exam (→ `intense`).
  const overloaded = new Set<string>();

  // Build a per-course pacing plan: its remaining topic-work and the even-spread
  // target/day needed to finish exactly on its exam over its remaining study days.
  const paces: CoursePace[] = [];
  for (const c of courses) {
    const folded = foldCompletedSessions(c); // effort reduced by completed work
    const calibration = calibrationFromHistory(c.blocks);
    // Per-course difficulty scales every topic's study time (harder → more,
    // easier → less). Default difficulty (3) → 1.0, so an unrated course schedules
    // exactly as it did before this dial existed (no regression).
    const difficulty = difficultyMultiplier(c.difficulty);
    const exam = c.examDate.toISOString().slice(0, 10);
    const days = c.studyDays
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));

    const work: Work[] = [];
    let order = 0;
    for (const t of folded.topics) {
      const o = order++;
      if (t.done) continue;
      const minutes = Math.ceil(clampEffort(t.effort) * MINUTES_PER_EFFORT * calibration * difficulty);
      if (minutes > 0) {
        work.push({ courseId: c.id, topicId: t.id, title: t.title, rem: minutes, order: o, exam, studyDays: days });
      }
    }
    // INV1: never schedule on/after the exam. A course whose exam is today or
    // already past has NO runway — mirror the pure engine (empty plan, flagged
    // intense while work remains) instead of letting the leftover pile-on dump
    // everything onto *today*, which ate the whole global ceiling and starved
    // every live course's day.
    if (exam <= today) {
      if (work.length > 0) overloaded.add(c.id);
      paces.push({ courseId: c.id, exam, studyDays: days, work: [], targetPerDay: 0 });
      continue;
    }
    if (work.length === 0) {
      paces.push({ courseId: c.id, exam, studyDays: days, work, targetPerDay: 0 });
      continue;
    }

    // Even-spread pace: total remaining work / number of study days before the
    // exam. This is the daily budget that finishes the course EXACTLY on time if
    // applied every study day — the heart of "spread to the exam, don't front
    // pack". Capped at the global ceiling so a single huge course can't claim a
    // whole (impossible) day on its own (its overflow then piles + flags intense).
    // NOT floored up to a full session: a light course over a long runway must be
    // allowed a SHORT daily target (e.g. 15 min/day) so it spans the whole runway
    // instead of finishing early — we only enforce a sensible minimum on the size
    // of an individual block, not on the daily target.
    const runway = runwayDates(today, exam, days).length;
    const totalRem = work.reduce((s, w) => s + w.rem, 0);
    const evenPace = runway > 0 ? Math.ceil(totalRem / runway) : totalRem;
    const targetPerDay = Math.min(GLOBAL_DAILY_MINUTES, Math.max(1, evenPace));
    paces.push({ courseId: c.id, exam, studyDays: days, work, targetPerDay });
  }

  const studyByCourse = new Map<string, EngineBlock[]>();
  for (const c of courses) studyByCourse.set(c.id, []);
  // Running per-day total across ALL courses, so we can honour the global daily
  // ceiling (a crowded day can't exceed ~6h minus that day's lectures).
  const dayLoad = new Map<string, number>();
  const ceilingFor = (date: string) => {
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    return dailyStudyCeiling(lectureMinByDow[dow]);
  };

  // Completed sessions consume real capacity. Seed each day's load with the
  // already-completed blocks from today on (that time is spent — fresh work must
  // fit around it), and remember each topic's completed STUDY days: a fresh
  // study block re-planned onto such a day would collide with the durable
  // completed row in persistBlocks and be silently dropped — its minutes lost
  // instead of redistributed — so the day loop steers that topic elsewhere.
  const completedTopicDays = new Set<string>();
  for (const c of courses) {
    for (const b of c.blocks) {
      if (!b.completed) continue;
      const day = b.date.toISOString().slice(0, 10);
      if (day < today) continue;
      const minutes = Number.isFinite(b.minutes) ? Math.max(b.minutes, 0) : 0;
      dayLoad.set(day, (dayLoad.get(day) ?? 0) + minutes);
      if ((b.kind ?? "study") === "study") completedTopicDays.add(`${b.topicId}|${day}`);
    }
  }

  // EVEN-SPREAD per course, ACROSS THE FULL RUNWAY. The core change vs the old
  // front-packer: we don't pour each course into the earliest days until its work
  // is gone. Instead we walk EVERY study day from today to the exam and give the
  // course its even target on each, so a light course with a long runway gets a
  // short session spaced out the whole way (steady study, no empty tail) and a
  // heavy course fills more per day. Nearer exams are processed first so they win
  // contested minutes when the global ceiling binds on a crowded day.
  const orderedPaces = [...paces].sort((a, b) => a.exam.localeCompare(b.exam));
  for (const p of orderedPaces) {
    if (p.work.length === 0) continue;
    const dates = runwayDates(today, p.exam, p.studyDays);
    // No runway at all → everything is overload; piled onto the last day below.
    let ti = 0; // round-robin cursor across this course's topics (course order)
    // "Credit" accrues the even daily pace; we only spend it as a real block once
    // it reaches MIN_BLOCK_MINUTES. For a heavy course (pace >= a session) this is
    // a no-op — it spends every day. For a LIGHT course (pace < a block) it makes
    // the course study on a SPACED subset of days across the whole runway (real
    // sessions, not slivers, and no empty tail), which is the spread we want.
    let credit = 0;
    for (let di = 0; di < dates.length; di++) {
      const date = dates[di];
      credit += p.targetPerDay;
      const daysLeft = dates.length - di;
      const remTotal = p.work.reduce((s, w) => s + w.rem, 0);
      // Spend once we've banked a real block — or unconditionally near the exam,
      // so the run-up days still carry study and nothing slides past the deadline.
      if (credit < MIN_BLOCK_MINUTES && remTotal > 0 && daysLeft > credit / Math.max(1, p.targetPerDay)) {
        continue;
      }
      // What this course may use today: the credit it has banked, but never
      // pushing the day's combined load past the global ceiling (nearer exams
      // already took their share first, so a later exam yields on a crowded day).
      const used = dayLoad.get(date) ?? 0;
      const room = Math.max(0, ceilingFor(date) - used);
      let courseBudget = Math.min(credit, room);
      const spentBefore = courseBudget;
      const perTopicToday: Record<string, number> = {};
      let guard = 0;
      while (courseBudget > 0 && guard++ < 1000) {
        if (!p.work.some((w) => w.rem > 0)) break;
        // Next still-owing topic from the round-robin cursor, in course order, so
        // foundational topics lead, later topics follow, and each is touched
        // across several days (no single-day cram) — bounded by the per-topic cap.
        // A day the topic already has a COMPLETED study session on is skipped:
        // persistBlocks would drop the colliding fresh block (lost minutes).
        let pick: Work | null = null;
        for (let k = 0; k < p.work.length; k++) {
          const w = p.work[(ti + k) % p.work.length];
          if (
            w.rem > 0 &&
            (perTopicToday[w.topicId] ?? 0) < MAX_TOPIC_MINUTES_PER_DAY &&
            !completedTopicDays.has(`${w.topicId}|${date}`)
          ) {
            pick = w;
            ti = (ti + k + 1) % p.work.length;
            break;
          }
        }
        if (!pick) break;
        const chunk = Math.min(
          SESSION_MINUTES,
          pick.rem,
          courseBudget,
          MAX_TOPIC_MINUTES_PER_DAY - (perTopicToday[pick.topicId] ?? 0),
        );
        studyByCourse.get(pick.courseId)!.push({
          date,
          topicId: pick.topicId,
          topicTitle: pick.title,
          minutes: chunk,
          completed: false,
          kind: "study",
        });
        pick.rem -= chunk;
        courseBudget -= chunk;
        perTopicToday[pick.topicId] = (perTopicToday[pick.topicId] ?? 0) + chunk;
        dayLoad.set(date, (dayLoad.get(date) ?? 0) + chunk);
      }
      // Consume only what we actually placed today; carry the rest forward so the
      // even pace is preserved (an unspendable day — ceiling full, topic caps hit —
      // banks its budget for the next day rather than losing it).
      credit -= spentBefore - courseBudget;
    }

    // Anything still owing couldn't fit before this course's exam (runway too
    // short, or the global ceiling kept squeezing it out) → pile onto its last
    // study day (visible, never dropped) and flag the course intense.
    for (const w of p.work) {
      if (w.rem <= 0) continue;
      overloaded.add(w.courseId);
      const dates2 = runwayDates(today, w.exam, w.studyDays);
      // Latest study day WITHOUT a completed session of this topic — a pile-on
      // colliding with a durable completed block would be silently dropped.
      let target = dates2.length ? dates2[dates2.length - 1] : today;
      for (let i = dates2.length - 1; i >= 0; i--) {
        if (!completedTopicDays.has(`${w.topicId}|${dates2[i]}`)) {
          target = dates2[i];
          break;
        }
      }
      studyByCourse.get(w.courseId)!.push({
        date: target,
        topicId: w.topicId,
        topicTitle: w.title,
        minutes: w.rem,
        completed: false,
        kind: "study",
      });
      dayLoad.set(target, (dayLoad.get(target) ?? 0) + w.rem);
      w.rem = 0;
    }
  }

  // Persist per course: study blocks + spaced reviews; record pace + intensity.
  const result = new Map<string, { isOverloaded: boolean; minutesPerDay: number }>();
  for (const c of courses) {
    const study = studyByCourse.get(c.id) ?? [];
    const exam = c.examDate.toISOString().slice(0, 10);
    const dates = runwayDates(
      today,
      exam,
      c.studyDays.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)),
    );

    // A topic that produces NO new study this rebuild (done / fully folded) gets
    // no reviews from buildReviewBlocks (it derives them from fresh study only),
    // so the wipe-and-recreate used to erase its pending retention schedule on
    // EVERY rebuild — even one triggered by a different course. Carry its
    // still-valid pending reviews over instead: never past ones, never on/after
    // the exam, at most one per topic+day, and only for topics that still exist.
    const liveTopicIds = new Set(c.topics.map((t) => t.id));
    const studiedTopicIds = new Set(study.map((b) => b.topicId));
    const preserved: EngineBlock[] = [];
    const preservedSeen = new Set<string>();
    for (const b of c.blocks) {
      if ((b.kind ?? "study") !== "review" || b.completed) continue;
      if (!liveTopicIds.has(b.topicId) || studiedTopicIds.has(b.topicId)) continue;
      const day = b.date.toISOString().slice(0, 10);
      if (day < today || day >= exam) continue;
      const key = `${b.topicId}|${day}`;
      if (preservedSeen.has(key)) continue;
      preservedSeen.add(key);
      const minutes = Number.isFinite(b.minutes) && b.minutes > 0 ? b.minutes : REVIEW_MINUTES;
      preserved.push({
        date: day,
        topicId: b.topicId,
        topicTitle: b.topicTitle,
        minutes,
        completed: false,
        kind: "review",
      });
      // Preserved reviews already sit on the calendar — count them toward the
      // day's load so freshly-fitted reviews see an honest total.
      dayLoad.set(day, (dayLoad.get(day) ?? 0) + minutes);
    }

    // Confidence signal from the student's per-topic self-rating: struggling
    // topics earn more/earlier reviews, solid fewer. Unrated topics aren't in
    // the map, so they keep the unchanged baseline spacing (no regression).
    // fitReviews then counts each review toward the global daily ceiling,
    // sliding it to the next study day with room when its slot is full.
    const reviews = fitReviews(
      buildReviewBlocks(study, dates, reviewDifficultyByTopic(c.topics)),
      dates,
      dayLoad,
      ceilingFor,
    );
    await persistBlocks(c.id, [...study, ...reviews, ...preserved]);

    const daysUsed = new Set(study.map((b) => b.date)).size || 1;
    const minutesPerDay = Math.round(study.reduce((s, b) => s + b.minutes, 0) / daysUsed);
    const isOverloaded = overloaded.has(c.id);
    await prisma.course.update({
      where: { id: c.id },
      data: { minutesPerDay: minutesPerDay || c.minutesPerDay, intense: isOverloaded },
    });
    result.set(c.id, { isOverloaded, minutesPerDay });
  }
  return result;
}

/** Look up the owning user, then run the global rebuild; return this course's result. */
async function rebuildForCourse(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { userId: true } });
  if (!course) throw new Error("Course not found");
  const results = await rebuildSchedule(course.userId);
  return results.get(courseId) ?? { isOverloaded: false, minutesPerDay: 0 };
}

/** (Re)build the whole schedule (any course change reshuffles the global plan). */
export async function regeneratePlan(courseId: string) {
  return rebuildForCourse(courseId);
}

/** "I fell behind" — recompute the global schedule over the days left. */
export async function healCoursePlan(courseId: string) {
  return rebuildForCourse(courseId);
}

/**
 * Marker for AI-added review topics: their (AI-only) `questions` column is set
 * to an EMPTY question array at creation — a value that never occurs naturally
 * (generateSelfTests only ever stores non-empty arrays; review topics are
 * excluded from it) and that every consumer already renders as "no questions".
 * Re-optimizing clears exactly the review topics the AI created by this tag,
 * never by title: the old `startsWith: "Review:"` delete (case-insensitive
 * under SQLite LIKE) also swept away topics the STUDENT happened to title
 * "Review: ...". Legacy untagged AI review topics degrade gracefully — they're
 * treated as real topics and deduped by title, so they don't pile up either.
 */
const AI_REVIEW_TOPIC_TAG = "[]";

/**
 * AI optimization (hybrid): the model judges difficulty/order and adds spaced
 * review sessions; we persist those as topic effort/order (+ review topics), then
 * the deterministic engine schedules them. Runs once per course (or on demand);
 * no AI call on later replans. No-op if no API key.
 */
export async function aiOptimizeCourse(courseId: string): Promise<boolean> {
  if (!isSyllabusAIEnabled()) return false;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      name: true,
      examDate: true,
      topics: { select: { id: true, title: true, questions: true } },
    },
  });
  if (!course || course.topics.length === 0) return false;

  const days = Math.max(
    1,
    Math.round((course.examDate.getTime() - Date.now()) / 86_400_000),
  );
  const realTopics = course.topics.filter((t) => t.questions !== AI_REVIEW_TOPIC_TAG);
  const items = await optimizeStudyPlan(
    course.name,
    realTopics.map((t) => t.title),
    days,
  );
  if (items.length === 0) return false;

  // Clear previously AI-added review topics so re-optimizing doesn't pile them
  // up — matched by our own tag, so a student's "Review: ..." topic is safe.
  await prisma.topic.deleteMany({
    where: { courseId, questions: AI_REVIEW_TOPIC_TAG },
  });

  const byTitle = new Map(realTopics.map((t) => [t.title.trim().toLowerCase(), t]));
  let order = 0;
  for (const it of items) {
    const title = it.title.trim();
    // Clamped defensively (junk/absurd model output must never persist an
    // effort that later explodes the rebuild maths); 0/invalid falls back to 1.
    const effort = clampEffort(it.effort) || 1;
    const existing = byTitle.get(title.toLowerCase());
    if (existing) {
      await prisma.topic.update({ where: { id: existing.id }, data: { effort, order } });
      byTitle.delete(title.toLowerCase());
    } else if (it.isReview || /^review:/i.test(title)) {
      await prisma.topic.create({
        data: { courseId, title, effort, order, questions: AI_REVIEW_TOPIC_TAG },
      });
    }
    order++;
  }
  // Any original topic the model omitted keeps its place at the end.
  for (const leftover of byTitle.values()) {
    await prisma.topic.update({ where: { id: leftover.id }, data: { order: order++ } });
  }

  // Active recall: generate self-test questions per topic (one call), store as JSON.
  try {
    const all = await prisma.topic.findMany({
      where: { courseId },
      select: { id: true, title: true, questions: true },
    });
    // Filtered in JS (not SQL) so the AI-review tag match is exact, never LIKE.
    const fresh = all.filter((t) => t.questions !== AI_REVIEW_TOPIC_TAG);
    const tests = await generateSelfTests(course.name, fresh.map((t) => t.title));
    const qByTitle = new Map(tests.map((x) => [x.title.trim().toLowerCase(), x.questions]));
    for (const t of fresh) {
      const qs = qByTitle.get(t.title.trim().toLowerCase());
      if (qs && qs.length > 0) {
        await prisma.topic.update({ where: { id: t.id }, data: { questions: JSON.stringify(qs) } });
      }
    }
  } catch {
    // questions are a bonus — never block optimization on them
  }

  await prisma.course.update({ where: { id: courseId }, data: { aiOptimized: true } });
  await regeneratePlan(courseId);
  return true;
}

/** Read-only: did the global scheduler fail to fit this course before its exam? */
export async function isCourseOverloaded(courseId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { intense: true },
  });
  return course?.intense ?? false;
}

/**
 * Why a course is overloaded — the single dominant reason the scheduler couldn't
 * fit it before the exam. Drives a truthful banner instead of a hardcoded one.
 *  - `no-runway`   : the exam is here / no study days are left before it.
 *  - `few-days`    : there ARE study days, but too few of them (add study days).
 *  - `over-ceiling`: even using every study day, the required pace exceeds what a
 *                    realistic day allows (the global ~6h ceiling) — the work
 *                    simply doesn't fit; heal/replan is the honest next step.
 */
export type OverloadCause = "no-runway" | "few-days" | "over-ceiling";

/** Real, plan-derived overload figures for one course (no hardcoded numbers). */
export type CourseOverloadInfo = {
  overloaded: boolean;
  /** Study minutes still owed (folded by completed work, scaled like the plan). */
  remainingMinutes: number;
  /** Number of study days left from today to the exam (exclusive). */
  daysLeft: number;
  /** Required minutes/day to finish exactly on time over the days left. */
  requiredPerDay: number;
  /** The realistic per-day study ceiling this pace is measured against (~6h). */
  ceilingPerDay: number;
  /** The dominant reason it doesn't fit. Null when not overloaded. */
  cause: OverloadCause | null;
};

/**
 * Read the persisted `intense` flag (authoritative, from the global scheduler)
 * AND recompute the same real figures the scheduler uses for THIS course, so the
 * UI can show the actual required pace / days left / cause rather than a static
 * string. Mirrors {@link rebuildScheduleInner}'s per-course pace maths
 * (fold completed work → scale by calibration & difficulty → spread over the
 * remaining study dates), kept read-only here.
 */
export async function courseOverloadInfo(courseId: string): Promise<CourseOverloadInfo> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      id: true,
      name: true,
      userId: true,
      examDate: true,
      studyDays: true,
      minutesPerDay: true,
      difficulty: true,
      intense: true,
      topics: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, effort: true, done: true, confidence: true },
      },
      blocks: { select: { topicId: true, topicTitle: true, date: true, minutes: true, completed: true, kind: true, actualMinutes: true } },
    },
  });

  const empty: CourseOverloadInfo = {
    overloaded: false,
    remainingMinutes: 0,
    daysLeft: 0,
    requiredPerDay: 0,
    ceilingPerDay: GLOBAL_DAILY_MINUTES,
    cause: null,
  };
  if (!course) return empty;

  const overloaded = course.intense;

  // Remaining study minutes for this course, computed exactly as the scheduler
  // does: completed sessions reduce a topic's effort (fold), then calibration and
  // per-course difficulty scale what's left into real minutes.
  const folded = foldCompletedSessions(course);
  const calibration = calibrationFromHistory(course.blocks);
  const difficulty = difficultyMultiplier(course.difficulty);
  let remainingMinutes = 0;
  for (const t of folded.topics) {
    if (t.done) continue;
    remainingMinutes += Math.ceil(clampEffort(t.effort) * MINUTES_PER_EFFORT * calibration * difficulty);
  }

  const today = todayISO();
  const exam = course.examDate.toISOString().slice(0, 10);
  const days = course.studyDays
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
  // Capped like the scheduler's runway: this runs on every course-detail render,
  // so a pathological far-future exam must not enumerate (or loop over) an
  // unbounded date list here either.
  const dates = runwayDates(today, exam, days);
  const daysLeft = dates.length;

  // Required even pace to finish on time over the days that remain.
  const requiredPerDay = daysLeft > 0 ? Math.ceil(remainingMinutes / daysLeft) : remainingMinutes;

  // Worst (smallest) realistic study ceiling across the remaining study days —
  // a class-heavy weekday leaves less room, so we compare the required pace
  // against the tightest day's ceiling rather than the raw global cap.
  // Lectures are per user; total lecture minutes per weekday so the ceiling
  // matches the scheduler's timetable-aware budget (a class-heavy day allows less).
  let ceilingPerDay = GLOBAL_DAILY_MINUTES;
  if (dates.length > 0) {
    const lectures = await prisma.lecture.findMany({
      where: { userId: course.userId },
      select: { weekday: true, startMin: true, endMin: true },
    });
    const lectureMinByDow = [0, 0, 0, 0, 0, 0, 0];
    for (const l of lectures) lectureMinByDow[l.weekday] += Math.max(0, l.endMin - l.startMin);
    let worst = GLOBAL_DAILY_MINUTES;
    for (const d of dates) {
      const dow = new Date(d + "T00:00:00Z").getUTCDay();
      worst = Math.min(worst, dailyStudyCeiling(lectureMinByDow[dow]));
    }
    ceilingPerDay = worst;
  }

  if (!overloaded) {
    return { overloaded: false, remainingMinutes, daysLeft, requiredPerDay, ceilingPerDay, cause: null };
  }

  // Dominant cause, most severe first:
  //  - no study days left before the exam → exam proximity (can't pace at all);
  //  - the required pace exceeds a realistic day's ceiling → the workload itself
  //    won't fit, no number of extra days helps within the runway → over-ceiling;
  //  - otherwise this course alone fits under the ceiling but the global scheduler
  //    still couldn't place it (too few study days / crowded out by other courses)
  //    → adding study days gives it more room → few-days.
  let cause: OverloadCause;
  if (daysLeft === 0) {
    cause = "no-runway";
  } else if (requiredPerDay > ceilingPerDay) {
    cause = "over-ceiling";
  } else {
    cause = "few-days";
  }

  return { overloaded: true, remainingMinutes, daysLeft, requiredPerDay, ceilingPerDay, cause };
}
