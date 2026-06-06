import { prisma } from "./db";
import {
  applyCompletedWork,
  planForDeadline,
  type Course as EngineCourse,
  type StudyBlock as EngineBlock,
} from "./planner";
import { isSyllabusAIEnabled, optimizeStudyPlan } from "./syllabus";

/** Today as an ISO date (YYYY-MM-DD), local time. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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

/**
 * Build (or rebuild) the plan: StudyFlow computes the daily pace needed to finish
 * every remaining topic before the exam, stores that pace, and schedules it.
 * Completed work is folded out first so we never re-schedule what's done.
 * Returns the recommended pace and whether it's humanly intense.
 */
async function buildPlan(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: { orderBy: { order: "asc" } }, blocks: true },
  });
  if (!course) throw new Error("Course not found");

  const engine = foldCompletedSessions(course); // reduce effort by completed work
  const calibration = calibrationFromHistory(course.blocks);
  const { blocks, minutesPerDay, intense } = planForDeadline(engine, todayISO(), {
    calibration,
  });

  // Persist the computed pace so the UI can show "study ~X/day".
  await prisma.course.update({
    where: { id: courseId },
    data: { minutesPerDay: minutesPerDay || course.minutesPerDay },
  });
  await persistBlocks(courseId, blocks);
  return { isOverloaded: intense, minutesPerDay };
}

/** (Re)build the plan from today and persist it (pace decided automatically). */
export async function regeneratePlan(courseId: string) {
  return buildPlan(courseId);
}

/** "I fell behind" — same engine; recomputes the pace over the days left. */
export async function healCoursePlan(courseId: string) {
  return buildPlan(courseId);
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

  await prisma.course.update({ where: { id: courseId }, data: { aiOptimized: true } });
  await regeneratePlan(courseId);
  return true;
}

/** Read-only: is the required daily pace humanly unrealistic (start earlier)? */
export async function isCourseOverloaded(courseId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: true, blocks: true },
  });
  if (!course) return false;
  return planForDeadline(foldCompletedSessions(course), todayISO()).intense;
}
