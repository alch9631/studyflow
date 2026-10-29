"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { coursePassed } from "@/lib/coursePassed";
import { readStoredExamSchedule, refreshMatchedExamDates } from "@/lib/examSync";
import { fetchTuhhExamSchedule, isSyncableExam, normalizeExamName } from "@/lib/tuhhExams";
import { todayISO } from "@/lib/planService";
import type { ExamApplyResult, ExamOptionsResult } from "@/lib/examSyncTypes";

export async function refreshExamDates(): Promise<ExamApplyResult> {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("EXAM_SYNC", userId)) return { ok: false, reason: "rate-limited" };
  let schedule;
  try {
    schedule = await fetchTuhhExamSchedule();
  } catch (error) {
    console.error("[exams:fetch]", error);
    return { ok: false, reason: "source-unavailable" };
  }
  try {
    const result = await refreshMatchedExamDates(userId, schedule);
    for (const path of ["/exams", "/settings", "/today", "/courses", "/calendar", "/insights", "/search"]) revalidatePath(path);
    revalidatePath("/courses/[id]", "page");
    return { ok: true, ...result, checkedAt: schedule.checkedAt };
  } catch (error) {
    console.error("[exams:refresh]", error);
    return { ok: false, reason: "save-error" };
  }
}

/** Load the large university list only when someone explicitly chooses a match. */
export async function getExamOptions(courseId: string): Promise<ExamOptionsResult> {
  const userId = await getCurrentUserId();
  if (typeof courseId !== "string" || courseId.length > 200) return { ok: false, reason: "invalid" };
  const [course, user] = await Promise.all([
    prisma.course.findFirst({ where: { id: courseId, userId }, select: { name: true, examSourceTitle: true, passed: true, grade: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { examSchedule: true } }),
  ]);
  if (!course || coursePassed(course)) return { ok: false, reason: "invalid" };
  const schedule = readStoredExamSchedule(user.examSchedule);
  if (!schedule) return { ok: false, reason: "source-unavailable" };
  const name = normalizeExamName(course.examSourceTitle ?? course.name);
  return { ok: true, exams: schedule.exams.filter((exam) => isSyncableExam(exam, todayISO()))
    .sort((a, b) => Number(b.names.includes(name)) - Number(a.names.includes(name)) || a.title.localeCompare(b.title) || a.date!.localeCompare(b.date!))
    .map(({ key, title, date, time }) => ({ key, title, date, time })) };
}
