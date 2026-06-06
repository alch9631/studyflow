import { prisma } from "./db";
import {
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
  // The plan is regenerated wholesale, so replace prior blocks.
  await prisma.studyBlock.deleteMany({ where: { courseId } });
  if (blocks.length === 0) return;
  await prisma.studyBlock.createMany({
    data: blocks.map((b) => ({
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
    include: { topics: true },
  });
  if (!course) return false;
  return healPlan(toEngineCourse(course), todayISO()).isOverloaded;
}

/**
 * The differentiator. Redistribute unfinished work across the days that remain
 * and persist the result. Returns whether the remaining time is overloaded.
 */
export async function healCoursePlan(courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: { topics: { orderBy: { order: "asc" } } },
  });
  if (!course) throw new Error("Course not found");
  const { blocks, isOverloaded } = healPlan(toEngineCourse(course), todayISO());
  await persistBlocks(courseId, blocks);
  return { isOverloaded };
}
