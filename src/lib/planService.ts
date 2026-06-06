import { prisma } from "./db";
import {
  applyCompletedWork,
  generatePlan,
  healPlan,
  type Course as EngineCourse,
  type StudyBlock as EngineBlock,
} from "./planner";

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
const blockKey = (topicTitle: string, date: Date) =>
  `${topicTitle}|${date.toISOString().slice(0, 10)}`;

/**
 * Fold per-session completion into the course the engine sees: a topic with
 * finished sessions carries less (or zero) effort into the next plan, so heal
 * doesn't redistribute work the student already did.
 */
function foldCompletedSessions(
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
function toEngineCourse(c: DbCourseWithTopics): EngineCourse {
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
    })),
  });
}

/** (Re)build a fresh plan from today and persist it. */
export async function regeneratePlan(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: { orderBy: { order: "asc" } } },
  });
  if (!course) throw new Error("Course not found");
  const blocks = generatePlan(toEngineCourse(course), todayISO());
  await persistBlocks(courseId, blocks);
  return { isOverloaded: false };
}

/** Read-only check: is the remaining work too much for the days left? */
export async function isCourseOverloaded(courseId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: true, blocks: true },
  });
  if (!course) return false;
  return healPlan(foldCompletedSessions(course), todayISO()).isOverloaded;
}

/**
 * The differentiator. Redistribute unfinished work across the days that remain
 * and persist the result. Returns whether the remaining time is overloaded.
 */
export async function healCoursePlan(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: { orderBy: { order: "asc" } }, blocks: true },
  });
  if (!course) throw new Error("Course not found");
  const { blocks, isOverloaded } = healPlan(foldCompletedSessions(course), todayISO());
  await persistBlocks(courseId, blocks);
  return { isOverloaded };
}
