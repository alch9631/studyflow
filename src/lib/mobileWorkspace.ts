import { prisma } from "./db";
import { ApiError } from "./apiError";
import { todayISO } from "./planService";
import { coursePassed } from "./coursePassed";
import { readStudyTask } from "./studyTask";
import { getRemainingExams } from "./examSync";
import { gatherStats } from "./stats";
import { summarizeLearning } from "./learningEvidence";
import { parsePrefs } from "./timePlacer";
import { isValidISODate } from "./validate";
import { instantToDayMinutes, instantToDayISO } from "./calendarTime";
import { buildHeatmap } from "../app/insights/heatmapData";

export async function mobileCourses(userId: string) {
  const courses = await prisma.course.findMany({ where: { userId }, orderBy: [{ examDate: "asc" }, { id: "asc" }],
    select: { id: true, name: true, examDate: true, grade: true, passed: true, ects: true, difficulty: true, studyDays: true,
      topics: { where: { parentTopicId: null }, select: { done: true } },
      blocks: { select: { completed: true, minutes: true, actualMinutes: true, kind: true } } } });
  return courses.map(({ topics, blocks, ...course }) => ({ ...course, examDate: course.examDate.toISOString().slice(0, 10),
    isPassed: coursePassed(course), topicsDone: topics.filter(t => t.done).length, topicsTotal: topics.length,
    remainingMinutes: blocks.filter(b => !b.completed && b.kind === "study").reduce((s, b) => s + b.minutes, 0),
    completedMinutes: blocks.filter(b => b.completed).reduce((s, b) => s + b.minutes, 0),
    loggedMinutes: blocks.reduce((s, b) => s + (b.actualMinutes ?? 0), 0) }));
}

export async function mobileCourse(userId: string, id: string) {
  const course = await prisma.course.findFirst({ where: { id, userId },
    select: { id: true, name: true, examDate: true, grade: true, passed: true, ects: true, difficulty: true, studyDays: true,
      topics: { orderBy: [{ order: "asc" }, { id: "asc" }], take: 2000,
        select: { id: true, title: true, done: true, confidence: true, parentTopicId: true, questions: true, studyTask: true, note: { select: { body: true } } } },
      files: { orderBy: { createdAt: "desc" }, take: 200, select: { id: true, filename: true, category: true, sizeBytes: true, analysis: true, createdAt: true } },
      assignments: { orderBy: { dueDate: "asc" }, take: 500, select: { id: true, title: true, dueDate: true, done: true } } } });
  if (!course) throw new ApiError("NOT_FOUND", "Course not found.");
  return { ...course, isPassed: coursePassed(course), examDate: course.examDate.toISOString().slice(0, 10),
    topics: course.topics.map(({ questions, studyTask, note, ...topic }) => ({ ...topic, task: readStudyTask(studyTask), note: note?.body ?? "",
      questions: parseStringArray(questions) })),
    files: course.files.map(({ analysis, ...file }) => ({ ...file, summary: parseSummary(analysis) })),
    assignments: course.assignments.map(a => ({ ...a, dueDate: a.dueDate.toISOString().slice(0, 10) })) };
}

function parseStringArray(raw: string | null): string[] {
  try { const value = JSON.parse(raw ?? "[]"); return Array.isArray(value) ? value.filter((x): x is string => typeof x === "string").slice(0, 100) : []; } catch { return []; }
}
function parseSummary(raw: string | null): string {
  try { const value = JSON.parse(raw ?? "{}"); return typeof value.summary === "string" ? value.summary : ""; } catch { return ""; }
}

export async function mobileExams(userId: string) {
  const [exams, courses] = await Promise.all([getRemainingExams(userId), mobileCourses(userId)]);
  return { ...exams, results: courses.filter(c => c.isPassed || c.grade !== null), allCourses: courses };
}

export async function mobileInsights(userId: string) {
  const today = todayISO();
  const since = new Date(Date.parse(today + "T00:00:00Z") - 91 * 86400_000);
  const [stats, results, activity, courses] = await Promise.all([
    gatherStats(userId, today),
    prisma.studyBlock.findMany({ where: { course: { userId }, studyResult: { not: null } }, orderBy: { date: "desc" }, take: 10000, select: { topicId: true, kind: true, studyResult: true } }),
    prisma.studyBlock.findMany({ where: { course: { userId }, completed: true, date: { gte: since } }, select: { date: true, minutes: true, completed: true } }),
    prisma.course.findMany({ where: { userId }, select: { examDate: true } }),
  ]);
  return { ...stats, today, evidence: summarizeLearning(results), heatmap: buildHeatmap(activity, courses.map(c => c.examDate), today, "Europe/Berlin", instantToDayISO) };
}

export async function mobileCalendar(userId: string, day?: string) {
  const today = todayISO();
  const anchor = new Date(`${day && isValidISODate(day) ? day : today}T00:00:00Z`);
  const start = new Date(anchor.getTime() - ((anchor.getUTCDay() + 6) % 7) * 86400_000);
  const end = new Date(start.getTime() + 7 * 86400_000);
  const [blocks, lectures, exams] = await Promise.all([
    prisma.studyBlock.findMany({ where: { course: { userId }, date: { gte: start, lt: end } }, orderBy: [{ date: "asc" }, { startTime: "asc" }, { id: "asc" }], take: 2000,
      select: { id: true, date: true, topicTitle: true, topicId: true, kind: true, minutes: true, completed: true, startTime: true, endTime: true, course: { select: { id: true, name: true } } } }),
    prisma.lecture.findMany({ where: { userId }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }], take: 500 }),
    prisma.course.findMany({ where: { userId, examDate: { gte: start, lt: end } }, select: { id: true, name: true, examDate: true, grade: true, passed: true } }),
  ]);
  return { today, days: Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400_000).toISOString().slice(0, 10)),
    blocks: blocks.map(b => ({ ...b, date: b.date.toISOString().slice(0, 10), start: b.startTime ? instantToDayMinutes(b.startTime) : null,
      end: b.endTime ? instantToDayMinutes(b.endTime) : null })), lectures,
    exams: exams.filter(c => !coursePassed(c)).map(c => ({ id: c.id, name: c.name, date: c.examDate.toISOString().slice(0, 10) })) };
}

export async function mobileCatalog(query: string) {
  return prisma.moduleTemplate.findMany({ where: query ? { OR: [{ name: { contains: query.slice(0, 100) } }, { code: { contains: query.slice(0, 100) } }] } : {},
    orderBy: [{ section: "asc" }, { name: "asc" }], take: 200,
    select: { id: true, code: true, name: true, section: true, ects: true, university: true, program: true, examDate: true, content: true } });
}

export async function mobilePreferences(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true, name: true, email: true, calendarToken: true } });
  if (!user.calendarToken) user.calendarToken = (await prisma.user.update({ where: { id: userId }, data: { calendarToken: crypto.randomUUID() }, select: { calendarToken: true } })).calendarToken;
  return { user: { name: user.name, email: user.email }, preferences: parsePrefs(user.preferences), calendarToken: user.calendarToken };
}
