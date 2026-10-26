"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { storeMaterial } from "@/lib/materials";
import { saveStudyTaskForUser, recordStudyResult, type StudyOutcome } from "@/lib/studyTaskService";
import { ValidationError } from "@/lib/validate";

function refreshStudy(courseId: string) {
  for (const path of [`/courses/${courseId}`, "/today", "/calendar", "/insights", "/focus", "/practice"]) revalidatePath(path);
}

export async function uploadMaterial(data: FormData) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false };
  const file = data.get("file");
  if (!(file instanceof File)) return { ok: false };
  try {
    const courseId = String(data.get("courseId") ?? "");
    const saved = await storeMaterial(userId, courseId, file, data.get("docType"));
    if (!saved) return { ok: false };
    refreshStudy(courseId);
    return { ok: true, id: saved.id };
  } catch (error) {
    if (error instanceof Error) return { ok: false, error: error.message };
    throw error;
  }
}

export async function saveStudyTask(data: FormData) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false };
  try {
    const courseId = String(data.get("courseId") ?? "");
    const saved = await saveStudyTaskForUser(userId, {
      courseId, topicId: String(data.get("topicId") ?? "") || undefined,
      title: String(data.get("title") ?? ""), task: Object.fromEntries(data),
    });
    if (!saved) return { ok: false };
    refreshStudy(courseId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function finishStudyTask(data: FormData) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false };
  try {
    const saved = await recordStudyResult(userId, {
      blockId: String(data.get("blockId") ?? ""), outcome: String(data.get("outcome")) as StudyOutcome,
      response: String(data.get("response") ?? ""), checked: data.get("checked") === "1",
      actualMinutes: Number(data.get("actualMinutes") ?? 0),
    });
    if (!saved) return { ok: false };
    refreshStudy(saved.courseId);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}
