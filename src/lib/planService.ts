import { prisma } from "./db";
import {
  applyCompletedWork,
  buildReviewBlocks,
  studyDatesBetween,
  addDaysISO,
  MINUTES_PER_EFFORT,
  SESSION_MINUTES,
  type Course as EngineCourse,
  type StudyBlock as EngineBlock,
} from "./planner";
import { isSyllabusAIEnabled, optimizeStudyPlan, generateSelfTests } from "./syllabus";

/** Realistic total study time per day across ALL of a student's courses. */
export const GLOBAL_DAILY_MINUTES = 180; // ~3h
/** Cap on one topic's time in a single day, so days stay interleaved/realistic. */
const MAX_TOPIC_MINUTES_PER_DAY = 60;
const MAX_SCHEDULE_DAYS = 400;
/** Even on a heavy lecture day, still allow at least this much study time. */
const MIN_DAILY_AFTER_LECTURES = 30;

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
  topics: { id: string; title: string; effort: number; done: boolean }[];
};

type DbBlock = { topicId: string; topicTitle: string; date: Date; minutes: number; completed: boolean };

/** Stable identity for a session, so completion survives a wipe-and-recreate. */
export const blockKey = (topicTitle: string, date: Date) =>
  `${topicTitle}|${date.toISOString().slice(0, 10)}`;

/**
 * Fold per-session completion into the course the engine sees: a topic with
 * finished sessions carries less (or zero) effort into the next plan, so heal
 * doesn't redistribute work the student already did.
 */
export function foldCompletedSessions(
  course: DbCourseWithTopics & { blocks: DbBlock[] },
): EngineCourse {
  const planned: Record<string, number> = {};
  const done: Record<string, number> = {};
  for (const b of course.blocks) {
    planned[b.topicId] = (planned[b.topicId] ?? 0) + b.minutes;
    if (b.completed) done[b.topicId] = (done[b.topicId] ?? 0) + b.minutes;
  }
  return applyCompletedWork(toEngineCourse(course), done, planned);
}

/** Map a persisted course into the shape the pure engine expects. */
export function toEngineCourse(c: DbCourseWithTopics): EngineCourse {
  return {
    id: c.id,
    name: c.name,
    examDate: c.examDate.toISOString().slice(0, 10),
    minutesPerDay: c.minutesPerDay,
    studyDays: c.studyDays
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n)),
    topics: c.topics.map((t) => ({
      id: t.id,
      title: t.title,
      effort: t.effort,
      done: t.done,
    })),
  };
}

async function persistBlocks(courseId: string, blocks: EngineBlock[]) {
  // Completed sessions are durable history — never wipe them. We rebuild only
  // the unfinished plan, and skip any freshly-planned block that lands on a
  // topic+date a completed session already covers (matching on topic+date).
  const existing = await prisma.studyBlock.findMany({ where: { courseId } });
  const completedKeys = new Set(
    existing.filter((b) => b.completed).map((b) => blockKey(b.topicTitle, b.date)),
  );
  await prisma.studyBlock.deleteMany({ where: { courseId, completed: false } });

  const fresh = blocks.filter(
    (b) => !completedKeys.has(blockKey(b.topicTitle, new Date(b.date + "T00:00:00Z"))),
  );
  if (fresh.length === 0) return;
  await prisma.studyBlock.createMany({
    data: fresh.map((b) => ({
      courseId,
      topicId: b.topicId,
      topicTitle: b.topicTitle,
      date: new Date(b.date + "T00:00:00Z"),
      minutes: b.minutes,
      completed: false,
      kind: b.kind,
    })),
  });
}

/**
 * Adaptive estimate (planning fallacy): if the student has logged actual time
 * (via the Pomodoro timer), learn whether they study faster/slower than the
 * estimate and scale future plans. Clamped, and only once there's enough data.
 */
function calibrationFromHistory(blocks: { minutes: number; actualMinutes: number | null }[]): number {
  const logged = blocks.filter((b) => b.actualMinutes && b.actualMinutes > 0);
  if (logged.length < 3) return 1;
  const planned = logged.reduce((s, b) => s + b.minutes, 0);
  const actual = logged.reduce((s, b) => s + (b.actualMinutes ?? 0), 0);
  if (planned <= 0) return 1;
  return Math.min(2.5, Math.max(0.5, actual / planned));
}

type Work = {
  courseId: string;
  topicId: string;
  title: string;
  rem: number; // minutes still to schedule
  exam: string; // ISO date
  studyDays: number[];
};

/**
 * GLOBAL realistic scheduler. Plans ALL of a student's courses together against a
 * single daily budget (~3h), so the total daily load is humanly realistic — not
 * 8 modules each demanding their own hours. Prioritises by exam proximity, caps
 * any one topic per day (keeps days interleaved), and never schedules past an
 * exam. Each course is flagged `intense` if its work can't fit before its exam.
 */
export async function rebuildSchedule(
  userId: string,
): Promise<Map<string, { isOverloaded: boolean; minutesPerDay: number }>> {
  const courses = await prisma.course.findMany({
    where: { userId },
    include: { topics: { orderBy: { order: "asc" } }, blocks: true },
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

  const pool: Work[] = [];
  for (const c of courses) {
    const folded = foldCompletedSessions(c); // effort reduced by completed work
    const calibration = calibrationFromHistory(c.blocks);
    const exam = c.examDate.toISOString().slice(0, 10);
    const days = c.studyDays
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    for (const t of folded.topics) {
      if (t.done) continue;
      const minutes = Math.ceil(Math.max(t.effort, 0) * MINUTES_PER_EFFORT * calibration);
      if (minutes > 0) {
        pool.push({ courseId: c.id, topicId: t.id, title: t.title, rem: minutes, exam, studyDays: days });
      }
    }
  }

  const studyByCourse = new Map<string, EngineBlock[]>();
  for (const c of courses) studyByCourse.set(c.id, []);

  // Day-by-day allocation within the global daily budget.
  let day = todayISO();
  for (let d = 0; d < MAX_SCHEDULE_DAYS && pool.some((w) => w.rem > 0); d++) {
    const dow = new Date(day + "T00:00:00Z").getUTCDay();
    // Subtract the day's lecture load from the study budget (floored), so study
    // is planned around real classes rather than on top of them.
    let budget = Math.max(MIN_DAILY_AFTER_LECTURES, GLOBAL_DAILY_MINUTES - lectureMinByDow[dow]);
    const perTopicToday: Record<string, number> = {};
    while (budget > 0) {
      const elig = pool.filter(
        (w) =>
          w.rem > 0 &&
          w.studyDays.includes(dow) &&
          day < w.exam &&
          (perTopicToday[w.topicId] ?? 0) < MAX_TOPIC_MINUTES_PER_DAY,
      );
      if (elig.length === 0) break;
      elig.sort((a, b) => a.exam.localeCompare(b.exam) || b.rem - a.rem); // soonest exam first
      const w = elig[0];
      const chunk = Math.min(
        SESSION_MINUTES,
        w.rem,
        budget,
        MAX_TOPIC_MINUTES_PER_DAY - (perTopicToday[w.topicId] ?? 0),
      );
      studyByCourse.get(w.courseId)!.push({
        date: day,
        topicId: w.topicId,
        topicTitle: w.title,
        minutes: chunk,
        completed: false,
        kind: "study",
      });
      w.rem -= chunk;
      budget -= chunk;
      perTopicToday[w.topicId] = (perTopicToday[w.topicId] ?? 0) + chunk;
    }
    day = addDaysISO(day, 1);
  }

  // Anything still unscheduled couldn't fit before its exam → pile onto the last
  // study day before that exam (visible, never dropped) and flag the course.
  const overloaded = new Set<string>();
  for (const w of pool) {
    if (w.rem <= 0) continue;
    overloaded.add(w.courseId);
    const dates = studyDatesBetween(todayISO(), w.exam, w.studyDays);
    const target = dates.length ? dates[dates.length - 1] : todayISO();
    studyByCourse.get(w.courseId)!.push({
      date: target,
      topicId: w.topicId,
      topicTitle: w.title,
      minutes: w.rem,
      completed: false,
      kind: "study",
    });
    w.rem = 0;
  }

  // Persist per course: study blocks + spaced reviews; record pace + intensity.
  const result = new Map<string, { isOverloaded: boolean; minutesPerDay: number }>();
  for (const c of courses) {
    const study = studyByCourse.get(c.id) ?? [];
    const dates = studyDatesBetween(
      todayISO(),
      c.examDate.toISOString().slice(0, 10),
      c.studyDays.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n)),
    );
    const reviews = buildReviewBlocks(study, dates);
    await persistBlocks(c.id, [...study, ...reviews]);

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
 * AI optimization (hybrid): the model judges difficulty/order and adds spaced
 * review sessions; we persist those as topic effort/order (+ review topics), then
 * the deterministic engine schedules them. Runs once per course (or on demand);
 * no AI call on later replans. No-op if no API key.
 */
export async function aiOptimizeCourse(courseId: string): Promise<boolean> {
  if (!isSyllabusAIEnabled()) return false;
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: true },
  });
  if (!course || course.topics.length === 0) return false;

  const days = Math.max(
    1,
    Math.round((course.examDate.getTime() - Date.now()) / 86_400_000),
  );
  const realTopics = course.topics.filter((t) => !/^review:/i.test(t.title));
  const items = await optimizeStudyPlan(
    course.name,
    realTopics.map((t) => t.title),
    days,
  );
  if (items.length === 0) return false;

  // Clear previously AI-added review topics so re-optimizing doesn't pile them up.
  await prisma.topic.deleteMany({
    where: { courseId, title: { startsWith: "Review:" } },
  });

  const byTitle = new Map(realTopics.map((t) => [t.title.trim().toLowerCase(), t]));
  let order = 0;
  for (const it of items) {
    const title = it.title.trim();
    const effort = it.effort > 0 ? it.effort : 1;
    const existing = byTitle.get(title.toLowerCase());
    if (existing) {
      await prisma.topic.update({ where: { id: existing.id }, data: { effort, order } });
      byTitle.delete(title.toLowerCase());
    } else if (it.isReview || /^review:/i.test(title)) {
      await prisma.topic.create({ data: { courseId, title, effort, order } });
    }
    order++;
  }
  // Any original topic the model omitted keeps its place at the end.
  for (const leftover of byTitle.values()) {
    await prisma.topic.update({ where: { id: leftover.id }, data: { order: order++ } });
  }

  // Active recall: generate self-test questions per topic (one call), store as JSON.
  try {
    const fresh = await prisma.topic.findMany({
      where: { courseId, title: { not: { startsWith: "Review:" } } },
    });
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
