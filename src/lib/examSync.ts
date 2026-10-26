import { prisma } from "./db";
import { coursePassed } from "./coursePassed";
import { rebuildSchedule, todayISO } from "./planService";
import { isValidISODate } from "./validate";
import { isSyncableExam, normalizeExamName } from "./tuhhExams";
import type { ExamDateChange, ExamSchedule, ExamSyncCourse, ExamSyncPreview } from "./examSyncTypes";

type SyncCourse = {
  id: string; name: string; examDate: Date; sourceCode: string | null;
  grade: number | null; passed: boolean;
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
      const matches = schedule.exams.filter((exam) => exam.names.some((name) => names.has(name)));
      const available = matches.filter((exam) => eligible.has(exam.key));
      const currentDate = course.examDate.toISOString().slice(0, 10);
      let hint: ExamSyncCourse["hint"] = "unmatched";
      if (matches.length > 1 && available.length > 0) hint = "ambiguous";
      else if (available.length === 1) hint = "matched";
      else if (matches.some((exam) => exam.individualAppointment)) hint = "individual";
      else if (matches.length) hint = "unpublished";
      const suggestedKey = hint === "matched" && available[0].date !== currentDate ? available[0].key : "";
      return { id: course.id, name: course.name, currentDate, suggestedKey, hint };
    }),
  };
}

export async function getExamSyncPreview(userId: string, schedule: ExamSchedule): Promise<ExamSyncPreview> {
  const courses = await prisma.course.findMany({
    where: { userId }, orderBy: { name: "asc" },
    select: { id: true, name: true, examDate: true, sourceCode: true, grade: true, passed: true },
  });
  const codes = [...new Set(courses.flatMap((course) => course.sourceCode ? [course.sourceCode] : []))];
  const templates = codes.length ? await prisma.moduleTemplate.findMany({
    where: { university: "TUHH", code: { in: codes } }, select: { code: true, name: true },
  }) : [];
  return buildExamSyncPreview(courses, templates, schedule, todayISO());
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
    return { ...change, date: exam.date };
  }).filter((change) => change.date !== change.expectedDate);

  // One transaction for all selected dates, with ownership and stale-preview guards
  // on EVERY write. A mismatch rolls back the whole selection.
  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const result = await tx.course.updateMany({
        where: {
          id: update.courseId, userId, examDate: new Date(`${update.expectedDate}T00:00:00Z`),
          passed: false, OR: [{ grade: null }, { grade: { gt: 4 } }],
        },
        data: { examDate: new Date(`${update.date}T00:00:00Z`) },
      });
      if (result.count !== 1) throw new ExamSyncConflict("The course changed. Refresh the preview.");
    }
  });
  let planRebuilt = true;
  if (updates.length) {
    try {
      // Dates affect shared capacity across all courses, so rebuild once globally.
      await rebuildSchedule(userId);
    } catch (error) {
      console.error("[examSync:rebuild]", error);
      planRebuilt = false;
    }
  }
  return { updated: updates.length, planRebuilt };
}
