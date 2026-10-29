import { prisma } from "./db";
import { coursePassed } from "./coursePassed";
import { rebuildSchedule, todayISO } from "./planService";
import { isValidISODate } from "./validate";
import { isSyncableExam, normalizeExamName } from "./tuhhExams";
import type { ExamDateChange, ExamSchedule, ExamSyncCourse, ExamSyncPreview, ExamsPageData } from "./examSyncTypes";

type SyncCourse = {
  id: string; name: string; examDate: Date; sourceCode: string | null;
  grade: number | null; passed: boolean;
  examSourceTitle?: string | null;
};
type TemplateName = { code: string; name: string };

export class ExamSyncConflict extends Error {}

export function buildExamSyncPreview(
  courses: SyncCourse[], templates: TemplateName[], schedule: ExamSchedule, today: string,
): ExamSyncPreview {
  const exams = schedule.exams.filter((exam) => isSyncableExam(exam, today));
  const eligible = new Set(exams.map((exam) => exam.key));
  const aliases = new Map<string, string[]>();
  for (const template of templates) {
    aliases.set(template.code, [...(aliases.get(template.code) ?? []), normalizeExamName(template.name)]);
  }
  return {
    semester: schedule.semester, checkedAt: schedule.checkedAt, exams,
    courses: courses.filter((course) => !coursePassed(course)).map((course): ExamSyncCourse => {
      const names = new Set([normalizeExamName(course.name), ...(course.sourceCode ? aliases.get(course.sourceCode) ?? [] : [])]);
      const matches = course.examSourceTitle
        ? schedule.exams.filter((exam) => normalizeExamName(exam.title) === normalizeExamName(course.examSourceTitle!))
        : schedule.exams.filter((exam) => exam.names.some((name) => names.has(name)));
      const available = matches.filter((exam) => eligible.has(exam.key));
      const currentDate = course.examDate.toISOString().slice(0, 10);
      let hint: ExamSyncCourse["hint"] = "unmatched";
      if (matches.length > 1 && available.length > 0) hint = "ambiguous";
      else if (available.length === 1) hint = "matched";
      else if (matches.some((exam) => exam.individualAppointment)) hint = "individual";
      else if (matches.length) hint = "unpublished";
      const suggestedKey = hint === "matched" && available[0].date !== currentDate ? available[0].key : "";
      return { id: course.id, name: course.name, currentDate, suggestedKey, matchedKey: hint === "matched" ? available[0].key : "", hint };
    }),
  };
}

async function syncCourses(userId: string, db: Pick<typeof prisma, "course" | "moduleTemplate"> = prisma) {
  const courses = await db.course.findMany({
    where: { userId }, orderBy: { name: "asc" },
    select: { id: true, name: true, examDate: true, sourceCode: true, grade: true, passed: true, examSourceTitle: true },
  });
  const codes = [...new Set(courses.flatMap((course) => course.sourceCode ? [course.sourceCode] : []))];
  const templates = codes.length ? await db.moduleTemplate.findMany({
    where: { university: "TUHH", code: { in: codes } }, select: { code: true, name: true },
  }) : [];
  return { courses, templates };
}

export async function getExamSyncPreview(userId: string, schedule: ExamSchedule): Promise<ExamSyncPreview> {
  const { courses, templates } = await syncCourses(userId);
  return buildExamSyncPreview(courses, templates, schedule, todayISO());
}

/** A failed check never replaces the last successful schedule. */
export function readStoredExamSchedule(raw: string | null): ExamSchedule | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as ExamSchedule;
    if (typeof value.semester !== "string" || typeof value.checkedAt !== "string" || !Number.isFinite(Date.parse(value.checkedAt)) || !Array.isArray(value.exams)
      || !value.exams.every((exam) => exam && typeof exam.key === "string" && /^[a-f0-9]{64}$/.test(exam.key) && typeof exam.title === "string"
        && Array.isArray(exam.names) && exam.names.every((name) => typeof name === "string")
        && (exam.date === null || (typeof exam.date === "string" && isValidISODate(exam.date)))
        && typeof exam.time === "string" && typeof exam.location === "string" && typeof exam.note === "string"
        && typeof exam.individualAppointment === "boolean")) return null;
    return value;
  } catch { return null; }
}

export async function getRemainingExams(userId: string): Promise<ExamsPageData> {
  const [{ courses, templates }, user] = await Promise.all([
    syncCourses(userId), prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { examSchedule: true } }),
  ]);
  const today = todayISO();
  const schedule = readStoredExamSchedule(user.examSchedule);
  const preview = buildExamSyncPreview(courses, templates, schedule ?? { semester: "", checkedAt: "", exams: [] }, today);
  const exams = new Map(schedule?.exams.map((exam) => [exam.key, exam]));
  return {
    semester: schedule?.semester ?? null, checkedAt: schedule?.checkedAt ?? null, today,
    courses: preview.courses.map((course) => {
      const exam = exams.get(course.matchedKey);
      return { ...course, published: exam ? { title: exam.title, date: exam.date, time: exam.time, location: exam.location } : null };
    }).sort((a, b) => {
      // Upcoming first; unfinished courses with old dates remain available for correction.
      return Number(a.currentDate < today) - Number(b.currentDate < today)
        || a.currentDate.localeCompare(b.currentDate) || a.name.localeCompare(b.name);
    }),
  };
}

/** Validate even direct action requests; only a course id, old date, and source key are accepted. */
export function parseExamDateChanges(input: unknown): ExamDateChange[] | null {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200) return null;
  const ids = new Set<string>();
  for (const change of input) {
    if (!change || typeof change !== "object"
      || typeof change.courseId !== "string" || !change.courseId || change.courseId.length > 200
      || typeof change.expectedDate !== "string" || !isValidISODate(change.expectedDate)
      || typeof change.examKey !== "string" || !/^[a-f0-9]{64}$/.test(change.examKey)
      || ids.has(change.courseId)) return null;
    ids.add(change.courseId);
  }
  return input as ExamDateChange[];
}

export async function applyExamDateChanges(userId: string, changes: ExamDateChange[], schedule: ExamSchedule) {
  const exams = new Map(schedule.exams.filter((exam) => isSyncableExam(exam, todayISO())).map((exam) => [exam.key, exam]));
  const updates = changes.map((change) => {
    const exam = exams.get(change.examKey);
    if (!exam?.date) throw new ExamSyncConflict("The published exam changed. Refresh the preview.");
    return { ...change, date: exam.date, title: exam.title };
  });

  // One transaction for all selected dates, with ownership and stale-preview guards
  // on EVERY write. A mismatch rolls back the whole selection.
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const result = await tx.course.updateMany({
        where: {
          id: update.courseId, userId, examDate: new Date(`${update.expectedDate}T00:00:00Z`),
          passed: false, OR: [{ grade: null }, { grade: { gt: 4 } }],
        },
        data: { examDate: new Date(`${update.date}T00:00:00Z`), examSourceTitle: update.title },
      });
      if (result.count !== 1) throw new ExamSyncConflict("The course changed. Refresh the preview.");
    }
    await tx.user.update({ where: { id: userId }, data: { examSchedule: JSON.stringify(schedule) } });
  });
  return rebuildForExamDates(userId, updates.filter((update) => update.date !== update.expectedDate).length);
}

/** One refresh updates exact matches only. Read, match, dates and snapshot commit together. */
export async function refreshMatchedExamDates(userId: string, schedule: ExamSchedule) {
  const updated = await prisma.$transaction(async (tx) => {
    const { courses, templates } = await syncCourses(userId, tx);
    const preview = buildExamSyncPreview(courses, templates, schedule, todayISO());
    const exams = new Map(preview.exams.map((exam) => [exam.key, exam]));
    let count = 0;
    for (const course of preview.courses) {
      const exam = exams.get(course.suggestedKey);
      if (!exam?.date) continue;
      await tx.course.update({ where: { id: course.id }, data: { examDate: new Date(`${exam.date}T00:00:00Z`) } });
      count++;
    }
    await tx.user.update({ where: { id: userId }, data: { examSchedule: JSON.stringify(schedule) } });
    return count;
  }, { timeout: 30_000 });
  return rebuildForExamDates(userId, updated);
}

async function rebuildForExamDates(userId: string, updated: number) {
  let planRebuilt = true;
  if (updated) {
    try {
      // Dates affect shared capacity across all courses, so rebuild once globally.
      await rebuildSchedule(userId);
    } catch (error) {
      console.error("[examSync:rebuild]", error);
      planRebuilt = false;
    }
  }
  return { updated, planRebuilt };
}
