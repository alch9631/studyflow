import { prisma } from "./db";
import {
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
  // The plan is regenerated wholesale, so replace prior blocks. Each block
  // carries its own completed flag (preserved across replans by rebuildPlan),
  // so we persist that rather than resetting completion to false.
  await prisma.studyBlock.deleteMany({ where: { courseId } });
  if (blocks.length === 0) return;
  await prisma.studyBlock.createMany({
    data: blocks.map((b) => ({
      courseId,
      topicId: b.topicId,
      topicTitle: b.topicTitle,
      date: new Date(b.date + "T00:00:00Z"),
      minutes: b.minutes,
      completed: b.completed,
    })),
  });
}

/**
 * Minutes the student has already studied per topic id, summed from completed
 * study blocks. This is the date-independent unit we carry across a replan so
 * checked-off work is never silently lost when the plan is rebuilt.
 */
async function completedMinutesByTopic(
  courseId: string,
): Promise<Record<string, number>> {
  const done = await prisma.studyBlock.findMany({
    where: { courseId, completed: true },
  });
  const byTopic: Record<string, number> = {};
  for (const b of done) byTopic[b.topicId] = (byTopic[b.topicId] ?? 0) + b.minutes;
  return byTopic;
}

/**
 * Shared replan. Rebuild the plan from today while (a) subtracting the minutes
 * already studied per topic so we only schedule what's LEFT, and (b) preserving
 * the completed study blocks themselves so checked-off work is never lost.
 *
 * Carrying the actual completed blocks (rather than re-marking new ones) keeps
 * completion exact: a 10-minute session can't accidentally tick a whole block.
 */
async function rebuildPlan(courseId: string): Promise<{ isOverloaded: boolean }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: { orderBy: { order: "asc" } } },
  });
  if (!course) throw new Error("Course not found");

  // Read completed sessions once: their minutes feed the subtraction, and the
  // blocks themselves are kept so the day's logged progress stays checked.
  const completedBlocks = await prisma.studyBlock.findMany({
    where: { courseId, completed: true },
  });
  const completedByTopic: Record<string, number> = {};
  for (const b of completedBlocks) {
    completedByTopic[b.topicId] = (completedByTopic[b.topicId] ?? 0) + b.minutes;
  }

  const { blocks, isOverloaded } = healPlan(
    toEngineCourse(course),
    todayISO(),
    completedByTopic,
  );

  // Done topics drop out of the plan entirely; keep completed sessions only for
  // topics still in play, riding alongside the redistributed remainder.
  const pendingTopicIds = new Set(
    course.topics.filter((t) => !t.done).map((t) => t.id),
  );
  const preserved: EngineBlock[] = completedBlocks
    .filter((b) => pendingTopicIds.has(b.topicId))
    .map((b) => ({
      date: b.date.toISOString().slice(0, 10),
      topicId: b.topicId,
      topicTitle: b.topicTitle,
      minutes: b.minutes,
      completed: true,
    }));

  await persistBlocks(courseId, [...preserved, ...blocks]);
  return { isOverloaded };
}

/**
 * (Re)build the plan from today, preserving completed work. Used after a topic
 * toggle, a settings edit, an import, or a catalog add — none of which should
 * lose the sessions the student has already checked off.
 */
export async function regeneratePlan(courseId: string) {
  return rebuildPlan(courseId);
}

/** Read-only check: is the remaining work too much for the days left? */
export async function isCourseOverloaded(courseId: string): Promise<boolean> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: true },
  });
  if (!course) return false;
  const completed = await completedMinutesByTopic(courseId);
  return healPlan(toEngineCourse(course), todayISO(), completed).isOverloaded;
}

/**
 * The differentiator: "I fell behind". Redistribute unfinished work across the
 * days that remain. Minutes already studied per topic are subtracted from the
 * redistribution AND preserved as completed blocks, so falling behind reshapes
 * only what's LEFT and never erases the progress you've logged.
 */
export async function healCoursePlan(courseId: string) {
  return rebuildPlan(courseId);
}
