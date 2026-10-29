"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { fetchTuhhExamSchedule } from "@/lib/tuhhExams";
import { applyExamDateChanges, ExamSyncConflict, getExamSyncPreview, parseExamDateChanges } from "@/lib/examSync";
import { rebuildSchedule } from "@/lib/planService";
import type { ExamApplyResult, ExamPreviewResult } from "@/lib/examSyncTypes";

function refreshPlanPages() {
  for (const path of ["/exams", "/settings", "/today", "/courses", "/calendar", "/insights", "/search"]) revalidatePath(path);
  revalidatePath("/courses/[id]", "page");
}

export async function previewExamDates(): Promise<ExamPreviewResult> {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("EXAM_SYNC", userId)) return { ok: false, reason: "rate-limited" };
  let schedule;
  try {
    schedule = await fetchTuhhExamSchedule();
  } catch (error) {
    console.error("[examSync:fetch]", error);
    return { ok: false, reason: "source-unavailable" };
  }
  try {
    return { ok: true, preview: await getExamSyncPreview(userId, schedule) };
  } catch (error) {
    console.error("[examSync:preview]", error);
    return { ok: false, reason: "save-error" };
  }
}

export async function syncExamDates(input: unknown): Promise<ExamApplyResult> {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("EXAM_SYNC", userId)) return { ok: false, reason: "rate-limited" };
  const changes = parseExamDateChanges(input);
  if (!changes) return { ok: false, reason: "invalid" };
  let schedule;
  try {
    // Refetch before applying: dates supplied by the client are never trusted.
    schedule = await fetchTuhhExamSchedule();
  } catch (error) {
    console.error("[examSync:fetch]", error);
    return { ok: false, reason: "source-unavailable" };
  }
  let result;
  try {
    result = await applyExamDateChanges(userId, changes, schedule);
  } catch (error) {
    if (error instanceof ExamSyncConflict) return { ok: false, reason: "conflict" };
    console.error("[examSync:apply]", error);
    return { ok: false, reason: "save-error" };
  }
  refreshPlanPages();
  return { ok: true, ...result, checkedAt: schedule.checkedAt };
}

export async function rebuildAfterExamSync(): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("EXAM_SYNC", userId)) return false;
  try {
    await rebuildSchedule(userId);
  } catch (error) {
    console.error("[examSync:retryRebuild]", error);
    return false;
  }
  refreshPlanPages();
  return true;
}
