import { prisma } from "./db";
import {
  applyCompletedWork,
  addDaysISO,
  REVIEW_INTERVALS_BY_DIFFICULTY,
  runwayDatesOrAllRemaining,
  difficultyMultiplier,
  MINUTES_PER_EFFORT,
  REVIEW_MINUTES,
  SESSION_MINUTES,
  type Course as EngineCourse,
  type StudyBlock as EngineBlock,
  type Difficulty,
} from "./planner";
import { isSyllabusAIEnabled, optimizeStudyPlan, generateSelfTests } from "./syllabus";
import { coursePassed } from "./coursePassed";
import { parsePrefs, studyCapacityByWeekday } from "./timePlacer";
import { readStudyResult, readStudyTask } from "./studyTask";
import { readTopicPlanning, suggestedTopicOrder, topicDeadline } from "./topicPlanning";
import { allocateMinutes, type AllocationJob } from "./scheduleAllocator";
import { instantToDayMinutes, instantToDayISO } from "./calendarTime";
import { availableStudyMinutes } from "./timePlacer";

/** Absolute safety ceiling; the student's daily budget and free window may be lower. */
export const GLOBAL_DAILY_MINUTES = 360;
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
  runwayDatesOrAllRemaining(start, exam, days).slice(0, MAX_SCHEDULE_DAYS);

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
  topics: { id: string; title: string; effort: number; done: boolean; studyTask?: string | null; parentTopicId?: string | null }[];
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
  sizeScale?: number | Record<string, number>,
): EngineCourse {
  // Child task estimates allocate part of the parent's original work. Keep the
  // remainder scheduled without counting the same work twice. Completed child
  // tasks still consume their allocation; they do not finish the whole topic.
  const allocated = new Map<string, number>();
  for (const topic of course.topics) {
    if (topic.parentTopicId) allocated.set(topic.parentTopicId,
      (allocated.get(topic.parentTopicId) ?? 0) + clampEffort(topic.effort));
  }
  course = { ...course, topics: course.topics.map((topic) => ({ ...topic,
    effort: Math.max(0, topic.effort - (allocated.get(topic.id) ?? 0)),
  })) };
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
  // `planned` above is only as complete as the rows that SURVIVE. Every path
  // that deletes a topic's unfinished blocks while keeping its completed ones
  // (INV1 wiping a course whose exam has arrived; a pile-on that collided with a
  // durable completed block) leaves planned == done — which reads as "topic
  // finished" and drops it from every future plan, stranding minutes the student
  // never studied. When the caller knows the scale the planner sizes topics with
  // (calibration × difficulty), we can reconstruct each topic's FULL planned size
  // from its effort — the one record of topic size that a plan wipe can't erase —
  // and use it as a floor. Without a scale the fold keeps trusting the rows,
  // so the pure/unit-tested behaviour is unchanged.
  const scaleFor = (id: string) => {
    const raw = sizeScale && typeof sizeScale === "object" ? sizeScale[id] : sizeScale;
    return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : 1;
  };
  if (sizeScale !== undefined) {
    for (const t of course.topics ?? []) {
      const full = clampEffort(t.effort) * MINUTES_PER_EFFORT * scaleFor(t.id);
      if (allocated.has(t.id) || full > (planned[t.id] ?? 0)) planned[t.id] = full;
    }
  }
  const folded = applyCompletedWork(toEngineCourse(course), done, planned);
  const originals = new Map(course.topics.map((topic) => [topic.id, topic]));
  folded.topics = folded.topics.map((topic) => {
    const scale = scaleFor(topic.id);
    const original = originals.get(topic.id)!;
    if (original.done || !readStudyTask(original.studyTask)) return topic;
    // Checking off time in Calendar/Today records a session, not a checked goal.
    // Keep a concrete follow-up until the student verifies the task's result.
    const studied = done[topic.id] ?? 0;
    const remaining = Math.max(studied > 0 ? MIN_BLOCK_MINUTES : 0, clampEffort(original.effort) * MINUTES_PER_EFFORT * scale - studied);
    return { ...topic, done: false, effort: remaining / (MINUTES_PER_EFFORT * scale) };
  });
  return folded;
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
  // the unfinished plan, and skip a freshly-planned REVIEW that lands on a
  // topic+date a completed review already covers (see the guard below; study
  // blocks are never dropped, because they only ever carry work still owed).
  // Atomic swap: a crash between the delete and the create must never leave a
  // course with no plan, so everything runs in ONE interactive transaction —
  // including the snapshot read: read outside it, a block completed in between
  // would survive the delete AND get a duplicate fresh row created.
  await prisma.$transaction(async (tx) => {
    const existing = await tx.studyBlock.findMany({
      where: { courseId },
      select: {
        id: true,
        completed: true,
        topicId: true,
        date: true,
        kind: true,
        startTime: true,
        endTime: true,
      },
    });
    // Only REVIEWS are de-duplicated against completed history. A review is a
    // fixed-size recall touch, so one already done on a topic+day makes a second
    // one that day redundant — dropping it costs nothing.
    //
    // STUDY is different: the caller folds completed minutes out of each topic's
    // effort before planning (foldCompletedSessions), so a fresh study block is
    // by construction work that is still OWED, never a re-run of a finished
    // session. Dropping it therefore doesn't de-duplicate anything — it destroys
    // minutes. The scheduler already steers a topic away from days it has a
    // completed session on (both the day loop and the pile-on), so a study
    // collision only happens when there is nowhere else to put the work: a short
    // runway where every remaining day is blocked. That is exactly the case where
    // the minutes must survive — an exam-eve remainder used to vanish here.
    const completedReviewKeys = new Set(
      existing
        .filter((b) => b.completed && (b.kind ?? "study") !== "study")
        .map((b) => blockKey(b.topicId, b.date, b.kind)),
    );
    const keptIds = blocks.flatMap(block => block.id ? [block.id] : []);
    const fresh = blocks.filter(
      (b) => !b.id && (
        (b.kind ?? "study") === "study" ||
        !completedReviewKeys.has(blockKey(b.topicId, new Date(b.date + "T00:00:00Z"), b.kind))),
    );
    await tx.studyBlock.deleteMany({ where: { courseId, completed: false, id: { notIn: keptIds } } });
    if (fresh.length > 0) {
      await tx.studyBlock.createMany({
        data: fresh.map((b) => {
          const date = new Date(b.date + "T00:00:00Z");
          return {
            courseId,
            topicId: b.topicId,
            topicTitle: b.topicTitle,
            date,
            minutes: b.minutes,
            completed: false,
            kind: b.kind,
            startTime: null,
            endTime: null,
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
  blocks: { minutes: number; actualMinutes: number | null; completed: boolean; kind?: string; studyResult?: string | null; date?: Date; topicId?: string }[],
  activity?: string,
): number {
  const samples = blocks.flatMap((block, index) => {
    const result = readStudyResult(block.studyResult);
    if (!block.completed || block.kind === "review" || !block.actualMinutes || block.actualMinutes <= 0 ||
        result?.outcome === "practice" || result?.outcome === "session" || activity && result?.activity !== activity) return [];
    const baseline = result?.baselineMinutes ?? block.minutes;
    const actual = result?.totalActualMinutes ?? block.actualMinutes;
    if (!Number.isFinite(baseline) || baseline <= 0 || !Number.isFinite(actual) || actual <= 0) return [];
    const at = result?.recordedAt ? Date.parse(result.recordedAt) : block.date?.getTime() ?? index;
    return [{ ratio: Math.min(2.5, Math.max(0.5, actual / baseline)), at, topicId: block.topicId }];
  }).sort((a, b) => b.at - a.at).slice(0, 20);
  // Distinct checked tasks provide stronger evidence than repeated timer slices.
  const seen = new Set<string>();
  const recent = samples.filter(sample => !sample.topicId || !seen.has(sample.topicId) && !!seen.add(sample.topicId));
  if (recent.length < 3) return 1;
  let weighted = 0, weights = 0;
  recent.forEach((sample, index) => { const weight = Math.pow(0.85, index); weighted += sample.ratio * weight; weights += weight; });
  // Three prior observations at the baseline prevent three small samples from
  // immediately doubling or halving an entire course's estimates.
  return Math.min(2.5, Math.max(0.5, (weighted + 3) / (weights + 3)));
}

export function topicCalibration(topic: { studyTask?: string | null }, blocks: Parameters<typeof calibrationFromHistory>[0]): number {
  const task = readStudyTask(topic.studyTask);
  return calibrationFromHistory(blocks, task?.activity ?? (task ? "general" : undefined));
}

/** Fit recall under capacity. Unfitted reviews must be reported as backlog by the caller. */
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
      if (!later) continue;
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

/** Load the planning inputs shared by allocation, recall and recovery. */
async function loadScheduleInputs(userId: string) {
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    // Only the fields the scheduler reads: course identity/pace + each topic's
    // effort/done + each block's completion (folding) and logged time (calibration).
    select: {
      id: true,
      name: true,
      examDate: true,
      studyDays: true,
      minutesPerDay: true,
      difficulty: true,
      // grade + passed decide whether the course is DONE for good (bestanden /
      // passing grade) and must drop out of scheduling entirely.
      grade: true,
      passed: true,
      topics: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, effort: true, done: true, confidence: true, studyTask: true, parentTopicId: true, planning: true, questions: true },
      },
      assignments: { select: { id: true, dueDate: true, done: true } },
      blocks: {
        select: {
          id: true,
          topicId: true,
          topicTitle: true,
          startTime: true,
          endTime: true,
          date: true,
          minutes: true,
          completed: true,
          kind: true,
          actualMinutes: true,
          studyResult: true,
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } });
  return { courses, lectures, prefs: parsePrefs(user?.preferences) };
}

export type UnscheduledWork = {
  topicId: string; topicTitle: string; minutes: number; kind: "study" | "review";
  reason: "capacity" | "prerequisite" | "deadline";
};
export type CourseSchedule = {
  blocks: EngineBlock[];
  unscheduled: UnscheduledWork[];
  isOverloaded: boolean;
  minutesPerDay: number;
};

/** One calculation powers previews, web, mobile and committed plans. Unplaced
 * work remains in topic effort and is reported separately from the calendar. */
export function calculateSchedule(
  { courses, lectures, prefs }: Awaited<ReturnType<typeof loadScheduleInputs>>,
  today: string,
): Map<string, CourseSchedule> {
  const capacities = studyCapacityByWeekday(prefs, lectures);
  const result = new Map<string, CourseSchedule>(courses.map(course => [course.id,
    { blocks: [], unscheduled: [], isOverloaded: false, minutesPerDay: 0 }]));
  const capacity = new Map<string, number>();
  const jobs: AllocationJob[] = [];
  type TopicWork = { courseId: string; topicId: string; title: string; minutes: number; dates: string[]; deadline: string; importance: number };
  const work = new Map<string, TopicWork>();
  const protectedReviews = new Set<string>();
  const pendingReviews: { work: TopicWork; target: string }[] = [];
  for (const course of courses) {
    if (coursePassed(course)) continue;
    const exam = course.examDate.toISOString().slice(0, 10);
    const days = course.studyDays.split(",").map(Number).filter(Number.isFinite);
    const dates = runwayDates(today, exam, days);
    for (const date of dates) if (!capacity.has(date)) capacity.set(date, capacities[new Date(date + "T00:00:00Z").getUTCDay()]);
  }
  // Actual time already spent consumes today's budget; never erase history.
  for (const course of courses) for (const block of course.blocks) {
    const date = block.date.toISOString().slice(0, 10);
    if (block.completed && capacity.has(date)) capacity.set(date, Math.max(0, capacity.get(date)! - Math.max(0, block.actualMinutes ?? block.minutes)));
  }
  for (const course of courses) {
    if (coursePassed(course)) continue;
    const plan = result.get(course.id)!;
    const exam = course.examDate.toISOString().slice(0, 10);
    const days = course.studyDays.split(",").map(Number).filter(Number.isFinite);
    const scales = Object.fromEntries(course.topics.map(topic => [topic.id, topicCalibration(topic, course.blocks) * difficultyMultiplier(course.difficulty)]));
    const folded = foldCompletedSessions(course, scales);
    for (let index = 0; index < course.topics.length; index++) {
      const topic = course.topics[index];
      // Legacy AI revision placeholders are superseded by the one review engine.
      if (topic.questions === AI_REVIEW_TOPIC_TAG) continue;
      const remaining = folded.topics.find(item => item.id === topic.id)!;
      const settings = readTopicPlanning(topic.planning);
      const deadline = topicDeadline(exam, settings, course.assignments);
      const dates = runwayDates(today, deadline, days);
      for (const date of dates) if (!capacity.has(date)) {
        const spent = courses.flatMap(course => course.blocks).filter(block => block.completed && block.date.toISOString().slice(0, 10) === date)
          .reduce((sum, block) => sum + Math.max(0, block.actualMinutes ?? block.minutes), 0);
        capacity.set(date, Math.max(0, capacities[new Date(date + "T00:00:00Z").getUTCDay()] - spent));
      }
      const minutes = remaining.done ? 0 : Math.ceil(clampEffort(remaining.effort) * MINUTES_PER_EFFORT * scales[topic.id]);
      const item: TopicWork = { courseId: course.id, topicId: topic.id, title: topic.title, minutes, dates, deadline, importance: settings.importance };
      work.set(topic.id, item);
      // Readiness is explicit: allocating time does not assert that a prerequisite
      // was understood. Dependent work activates after its checked completion.
      const blocked = settings.prerequisites.some(id => !course.topics.find(parent => parent.id === id)?.done);
      if (minutes > 0 && (blocked || dates.length === 0)) {
        plan.unscheduled.push({ topicId: topic.id, topicTitle: topic.title, minutes, kind: "study", reason: blocked ? "prerequisite" : "deadline" });
        continue;
      }
      let owed = minutes;
      // Timed commitments keep their date, duration, clock time and row id. Invalid
      // or conflicting old slots rejoin the allocation rather than claiming room.
      for (const block of course.blocks) {
        if (block.topicId !== topic.id || block.completed || !block.startTime || !block.endTime) continue;
        const date = block.date.toISOString().slice(0, 10);
        if (!dates.includes(date) || (capacity.get(date) ?? 0) < block.minutes) continue;
        const start = instantToDayMinutes(block.startTime), end = instantToDayMinutes(block.endTime);
        const busy = lectures.filter(lecture => lecture.weekday === new Date(date + "T00:00:00Z").getUTCDay());
        if (instantToDayISO(block.startTime) !== date || end - start !== block.minutes || start < prefs.dayStartMin || end > prefs.dayEndMin ||
            availableStudyMinutes({ startMin: start, endMin: end }, busy) !== block.minutes) continue;
        const isReview = block.kind === "review";
        if (!isReview && (owed < block.minutes || owed <= 0)) continue;
        const collision = courses.some(other => other.blocks.some(previous => previous.id !== block.id && previous.startTime && previous.endTime &&
          (previous.completed || result.get(other.id)!.blocks.some(saved => saved.id === previous.id)) && previous.startTime < block.endTime! && previous.endTime > block.startTime!));
        if (collision) continue;
        plan.blocks.push({ id: block.id, date, topicId: topic.id, topicTitle: topic.title, minutes: block.minutes, completed: false, kind: isReview ? "review" : "study" });
        capacity.set(date, capacity.get(date)! - block.minutes);
        if (isReview) protectedReviews.add(`${topic.id}|${date}`); else owed -= block.minutes;
      }
      if (owed > 0) {
        const learningDays = Math.max(1, dates.length - Math.min(7, Math.max(1, Math.floor(dates.length * 0.2))));
        // Begin later topic groups later when possible, while capacity repair may
        // use any legal date. Explicit prerequisites remain a hard readiness gate.
        const startIndex = Math.min(learningDays - 1, Math.floor(index / 2) * Math.floor(learningDays / Math.max(1, Math.ceil(course.topics.length / 2))));
        jobs.push({ id: topic.id, minutes: owed, dates, deadline, importance: settings.importance,
          preferredDates: dates.slice(startIndex, learningDays) });
      }
      const attempts = course.blocks.filter(block => block.topicId === topic.id && block.completed).map(block => {
        const evidence = readStudyResult(block.studyResult);
        const at = evidence?.recordedAt && Number.isFinite(Date.parse(evidence.recordedAt))
          ? instantToDayISO(new Date(evidence.recordedAt)) : block.date.toISOString().slice(0, 10);
        return { block, evidence, at, timestamp: evidence?.recordedAt ? Date.parse(evidence.recordedAt) : block.date.getTime() };
      }).filter(attempt => attempt.at <= today).sort((a, b) => b.timestamp - a.timestamp || Number(b.block.kind === "review") - Number(a.block.kind === "review"));
      const latest = attempts[0];
      if (latest) {
        const difficulty = latest.evidence?.outcome === "practice" ? "hard" : reviewDifficultyByTopic([topic])[topic.id] ?? "medium";
        const lastFailure = attempts.find(attempt => attempt.evidence?.outcome === "practice")?.timestamp ?? -Infinity;
        const successes = attempts.filter(attempt => attempt.timestamp > lastFailure && attempt.block.kind === "review" && attempt.evidence?.outcome !== "practice" && attempt.evidence?.outcome !== "session").length;
        const intervals = REVIEW_INTERVALS_BY_DIFFICULTY[difficulty];
        for (const interval of intervals.slice(Math.min(successes, intervals.length - 1))) {
          const target = addDaysISO(latest.at, interval);
          if (target < deadline) pendingReviews.push({ work: item, target: target < today ? today : target });
        }
      } else if (minutes === 0) {
        for (const block of course.blocks.filter(block => block.topicId === topic.id && !block.completed && block.kind === "review")) {
          const target = block.date.toISOString().slice(0, 10);
          if (target < deadline) pendingReviews.push({ work: item, target: target < today ? today : target });
        }
      }
    }
  }
  const reviewDays = new Set(protectedReviews);
  for (const course of courses) for (const block of course.blocks) if (block.completed && block.kind === "review") reviewDays.add(`${block.topicId}|${block.date.toISOString().slice(0, 10)}`);
  const requestedReviews = new Set<string>();
  const reserveReviews = (requests: typeof pendingReviews) => {
    for (const review of requests.sort((a, b) => a.target.localeCompare(b.target) || b.work.importance - a.work.importance || a.work.topicId.localeCompare(b.work.topicId))) {
      const item = review.work;
      const requestKey = `${item.topicId}|${review.target}`;
      if (requestedReviews.has(requestKey) || reviewDays.has(requestKey)) continue;
      requestedReviews.add(requestKey);
      const date = item.dates.find(date => date >= review.target && !reviewDays.has(`${item.topicId}|${date}`) && (capacity.get(date) ?? 0) >= REVIEW_MINUTES);
      if (!date) {
        if (!item.dates.some(date => date >= review.target && reviewDays.has(`${item.topicId}|${date}`))) result.get(item.courseId)!.unscheduled.push({ topicId: item.topicId, topicTitle: item.title, minutes: REVIEW_MINUTES, kind: "review", reason: "capacity" });
        continue;
      }
      result.get(item.courseId)!.blocks.push({ date, topicId: item.topicId, topicTitle: item.title, minutes: REVIEW_MINUTES, completed: false, kind: "review" });
      capacity.set(date, capacity.get(date)! - REVIEW_MINUTES); reviewDays.add(`${item.topicId}|${date}`);
    }
  };
  const withFinalRecall = (requests: typeof pendingReviews) => {
    const all = [...requests];
    for (const item of work.values()) {
      const last = item.dates.at(-1);
      if (last && requests.some(review => review.work.topicId === item.topicId) &&
          !requests.some(review => review.work.topicId === item.topicId && review.target === last)) all.push({ work: item, target: last });
    }
    return all;
  };
  // Actual recall debt is reserved before new learning. Future projections never
  // reset these anchors or silently move an overdue review out of sight.
  reserveReviews(withFinalRecall(pendingReviews));
  const preliminary = allocateMinutes(jobs, capacity);
  const forecasts: typeof pendingReviews = [];
  for (const item of work.values()) {
    if (item.minutes <= 0 || pendingReviews.some(review => review.work.topicId === item.topicId)) continue;
    const job = jobs.find(job => job.id === item.topicId);
    const protectedFirst = result.get(item.courseId)!.blocks.filter(block => block.kind === "study" && block.topicId === item.topicId).map(block => block.date).sort()[0];
    const proposedFirst = [...(preliminary.get(item.topicId)?.keys() ?? [])].sort()[0];
    const first = [protectedFirst, proposedFirst].filter((day): day is string => !!day).sort()[0];
    if (!first) continue;
    // Preserve the first exposure when adding its projected recall, including
    // courses whose entire study workload already has timed commitments.
    if (job && (!protectedFirst || first < protectedFirst)) {
      const exposure = Math.min(15, preliminary.get(item.topicId)!.get(first)!);
      result.get(item.courseId)!.blocks.push({ date: first, topicId: item.topicId, topicTitle: item.title, minutes: exposure, completed: false, kind: "study" });
      capacity.set(first, capacity.get(first)! - exposure); job.minutes -= exposure;
    }
    const topic = courses.find(course => course.id === item.courseId)!.topics.find(topic => topic.id === item.topicId)!;
    for (const interval of REVIEW_INTERVALS_BY_DIFFICULTY[reviewDifficultyByTopic([topic])[topic.id] ?? "medium"]) {
      const target = addDaysISO(first, interval);
      if (target < item.deadline) forecasts.push({ work: item, target });
    }
  }
  reserveReviews(withFinalRecall(forecasts));
  const allocated = allocateMinutes(jobs, capacity);
  for (const job of jobs) {
    const item = work.get(job.id)!;
    const plan = result.get(item.courseId)!;
    let placed = 0;
    for (const [date, minutes] of allocated.get(job.id) ?? []) {
      for (let left = minutes; left > 0;) {
        const chunk = Math.min(SESSION_MINUTES, left);
        plan.blocks.push({ date, topicId: item.topicId, topicTitle: item.title, minutes: chunk, completed: false, kind: "study" });
        placed += chunk; left -= chunk;
      }
    }
    if (placed < job.minutes) plan.unscheduled.push({ topicId: item.topicId, topicTitle: item.title, minutes: job.minutes - placed, kind: "study", reason: "capacity" });
  }
  for (const plan of result.values()) {
    plan.blocks.sort((a, b) => a.date.localeCompare(b.date) || a.topicId.localeCompare(b.topicId) || b.kind.localeCompare(a.kind));
    plan.isOverloaded = plan.unscheduled.length > 0;
    const days = new Set(plan.blocks.filter(block => block.kind === "study").map(block => block.date)).size;
    plan.minutesPerDay = days ? Math.round(plan.blocks.filter(block => block.kind === "study").reduce((sum, block) => sum + block.minutes, 0) / days) : 0;
  }
  return result;
}

/** Read-only recovery proposal, calculated by the same scheduler as apply. */
export async function previewSchedule(userId: string): Promise<Map<string, CourseSchedule>> {
  return calculateSchedule(await loadScheduleInputs(userId), todayISO());
}

async function rebuildScheduleInner(
  userId: string,
): Promise<Map<string, { isOverloaded: boolean; minutesPerDay: number }>> {
  const input = await loadScheduleInputs(userId);
  const schedule = calculateSchedule(input, todayISO());
  const result = new Map<string, { isOverloaded: boolean; minutesPerDay: number }>();
  for (const c of input.courses) {
    const { blocks, minutesPerDay, isOverloaded } = schedule.get(c.id)!;
    await persistBlocks(c.id, blocks);
    await prisma.course.update({
      where: { id: c.id },
      data: { minutesPerDay, intense: isOverloaded },
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
/** Apply only the ordering part of AI output; source estimates and history stay
 * authoritative. Kept separate so validation never requires a paid model call. */
export async function applySuggestedStudyOrder(courseId: string, items: { title: string; isReview: boolean }[]) {
  await prisma.$transaction(async tx => {
    const topics = await tx.topic.findMany({ where: { courseId, OR: [{ questions: null }, { questions: { not: AI_REVIEW_TOPIC_TAG } }] }, orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, title: true } });
    const ids = suggestedTopicOrder(topics, items);
    for (let order = 0; order < ids.length; order++) await tx.topic.update({ where: { id: ids[order] }, data: { order } });
  });
}

export async function aiOptimizeCourse(courseId: string): Promise<boolean> {
  if (!isSyllabusAIEnabled()) return false;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      name: true,
      examDate: true,
      topics: { select: { id: true, title: true, questions: true, studyTask: true, confidence: true, planning: true, done: true } },
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
    realTopics.map(topic => ({ title: topic.title, task: readStudyTask(topic.studyTask), confidence: topic.confidence, done: topic.done, planning: readTopicPlanning(topic.planning) })),
  );
  if (items.length === 0) return false;

  await applySuggestedStudyOrder(courseId, items);

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
 *  - `few-days`    : this course fits alone, but shared capacity cannot hold it.
 *  - `over-ceiling`: even using every study day, the required pace exceeds what a
 *                    realistic day allows (budget and free window) — the work
 *                    simply doesn't fit; heal/replan is the honest next step.
 */
export type OverloadCause = "no-runway" | "few-days" | "over-ceiling" | "prerequisite";

/** Real, plan-derived overload figures for one course (no hardcoded numbers). */
export type CourseOverloadInfo = {
  overloaded: boolean;
  /** Study minutes still owed (folded by completed work, scaled like the plan). */
  remainingMinutes: number;
  /** Number of study days left from today to the exam (exclusive). */
  daysLeft: number;
  /** Required minutes/day to finish exactly on time over the days left. */
  requiredPerDay: number;
  /** The realistic per-day study ceiling this pace is measured against. */
  ceilingPerDay: number;
  /** The dominant reason it doesn't fit. Null when not overloaded. */
  cause: OverloadCause | null;
  unscheduled: UnscheduledWork[];
};

/**
 * Preview the current global plan and compute its real figures for this course, so the
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
      grade: true,
      passed: true,
      topics: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, effort: true, done: true, confidence: true, studyTask: true, parentTopicId: true, planning: true, questions: true },
      },
      blocks: { select: { topicId: true, topicTitle: true, date: true, minutes: true, completed: true, kind: true, actualMinutes: true, studyResult: true } },
    },
  });

  const empty: CourseOverloadInfo = {
    overloaded: false,
    remainingMinutes: 0,
    daysLeft: 0,
    requiredPerDay: 0,
    ceilingPerDay: GLOBAL_DAILY_MINUTES,
    cause: null,
    unscheduled: [],
  };
  if (!course) return empty;
  // A passed course has nothing left to fit — mirror the scheduler's INV0, so
  // this read-only view can never claim overload for a module that's done.
  if (coursePassed(course)) return empty;

  // Current availability and remaining work decide this, not a stale persisted
  // flag from a previous plan or from an older scheduling algorithm.
  const proposal = (await previewSchedule(course.userId)).get(course.id);
  const overloaded = proposal?.isOverloaded ?? false;
  const unscheduled = proposal?.unscheduled ?? [];

  // Remaining study minutes for this course, computed exactly as the scheduler
  // does: completed sessions reduce a topic's effort (fold), then calibration and
  // per-course difficulty scale what's left into real minutes.
  const scales = Object.fromEntries(course.topics.map(topic => [topic.id, topicCalibration(topic, course.blocks) * difficultyMultiplier(course.difficulty)]));
  // Same size floor as the scheduler, so this read-only view can't disagree with
  // the plan it describes (e.g. report "0 minutes left" for a topic the rebuild
  // still owes work on because its unfinished rows were wiped).
  const folded = foldCompletedSessions(course, scales);
  let remainingMinutes = 0;
  for (const t of folded.topics) {
    if (t.done || course.topics.find(topic => topic.id === t.id)?.questions === AI_REVIEW_TOPIC_TAG) continue;
    remainingMinutes += Math.ceil(clampEffort(t.effort) * MINUTES_PER_EFFORT * scales[t.id]);
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

  // Compare the even pace with average usable capacity across its study days.
  // The preview above remains authoritative for shared, uneven daily loads.
  let ceilingPerDay = GLOBAL_DAILY_MINUTES;
  if (dates.length > 0) {
    const lectures = await prisma.lecture.findMany({
      where: { userId: course.userId },
      select: { weekday: true, startMin: true, endMin: true },
    });
    const user = await prisma.user.findUnique({ where: { id: course.userId }, select: { preferences: true } });
    const capacities = studyCapacityByWeekday(parsePrefs(user?.preferences), lectures);
    ceilingPerDay = Math.floor(dates.reduce((sum, date) => sum + capacities[new Date(date + "T00:00:00Z").getUTCDay()], 0) / dates.length);
  }

  if (!overloaded) {
    return { overloaded: false, remainingMinutes, daysLeft, requiredPerDay, ceilingPerDay, cause: null, unscheduled };
  }

  // Dominant cause, most severe first:
  //  - no study days left before the exam → exam proximity (can't pace at all);
  //  - the required pace exceeds a realistic day's ceiling → the workload itself
  //    won't fit, no number of extra days helps within the runway → over-ceiling;
  //  - otherwise this course alone fits under the ceiling but the global scheduler
  //    still couldn't place it (too few study days / crowded out by other courses)
  //    → review availability, study days or scope → few-days.
  let cause: OverloadCause;
  if (unscheduled.some(item => item.reason === "prerequisite")) {
    cause = "prerequisite";
  } else if (daysLeft === 0) {
    cause = "no-runway";
  } else if (requiredPerDay > ceilingPerDay) {
    cause = "over-ceiling";
  } else {
    cause = "few-days";
  }

  return { overloaded: true, remainingMinutes, daysLeft, requiredPerDay, ceilingPerDay, cause, unscheduled };
}
