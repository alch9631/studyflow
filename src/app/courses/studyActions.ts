"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { storeMaterial } from "@/lib/materials";
import { saveStudyTaskForUser, recordStudyResult, type StudyOutcome } from "@/lib/studyTaskService";
import { ValidationError } from "@/lib/validate";
import { prisma } from "@/lib/db";
import { prepareStudyDrafts, acceptStudyDrafts, startQuickStudy, saveStudyCheckpoint, quickStudySources } from "@/lib/practicalStudy";
import type { StudyMode } from "@/lib/studyTask";
import { readStudyDrafts } from "@/lib/studyDraft";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import { prepareMaterialOutline, acceptMaterialOutline, recognizeMaterialOutline } from "@/lib/materialOutline";
import { readMaterialOutline } from "@/lib/documentOutline";
import { startFocusForUser, finishFocusForUser } from "@/lib/focusSession";

export async function startFocusSession(input: { courseId: string; topicId?: string; fileId?: string; language: "en" | "de" }) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const };
  const result = await startFocusForUser(userId, input);
  // No revalidation before navigation: it would re-render the entire course just to start a clock.
  return result ? { ok: true as const, ...result } : { ok: false as const };
}

export async function finishFocusSession(input: { blockId: string; topicId: string; elapsedSeconds: number; response: string }) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false };
  try {
    const result = await finishFocusForUser(userId, input);
    if (result) refreshStudy(result.courseId, false);
    return { ok: !!result };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false };
    throw error;
  }
}

function refreshStudy(courseId: string, includeFocus = true) {
  // Finishing navigates to Today. Refreshing the active focus page first would
  // resolve and mount the next task (and its clock) before that navigation.
  for (const path of [`/courses/${courseId}`, "/today", "/calendar", "/insights", "/practice", ...(includeFocus ? ["/focus"] : [])]) revalidatePath(path);
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
      topicId: String(data.get("topicId") ?? "") || undefined,
      response: String(data.get("response") ?? ""), checked: data.get("checked") === "1",
      actualMinutes: Number(data.get("actualMinutes") ?? 0),
    });
    if (!saved) return { ok: false };
    refreshStudy(saved.courseId, false);
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function studyMaterials(courseId: string, topicId?: string) {
  const userId = await getCurrentUserId();
  const files = await prisma.moduleFile.findMany({ where: { courseId, course: { userId }, content: { not: null } },
    orderBy: { createdAt: "desc" }, take: 100, select: { id: true, filename: true, analysis: true } });
  return files.map((file) => ({ id: file.id, filename: file.filename,
    preferred: !!topicId && !!readMaterialOutline(file.analysis)?.units.some((unit) => unit.topicId === topicId) }));
}

/** Load the preferred source and its preview in one client round trip. */
export async function prepareQuickStudySetup(courseId: string, topicId?: string, fileId?: string) {
  const files = await studyMaterials(courseId, topicId);
  const sourceId = files.find((file) => file.id === fileId)?.id ?? files.find((file) => file.preferred)?.id ?? "";
  const preview = sourceId ? await previewQuickStudySource(courseId, sourceId, topicId) : null;
  return { files, sourceId, preview };
}

export async function prepareMaterialTasks(fileId: string, language: "en" | "de", next = false) {
  const userId = await getCurrentUserId();
  const file = await prisma.moduleFile.findFirst({ where: { id: fileId, course: { userId } }, select: { studyDrafts: true } });
  if (!file) return { ok: false as const, error: "NOT_FOUND" };
  const cached = readStudyDrafts(file.studyDrafts);
  if (cached && (!next || !cached.nextCursor)) return { ok: true as const, drafts: cached };
  const allowed = isSyllabusAIEnabled()
    ? checkRateLimit("AI_DOCUMENT", userId) && checkRateLimit("AI", userId)
    : checkRateLimit("MUTATION", userId);
  if (!allowed) return { ok: false as const, error: "RATE_LIMITED" };
  try {
    const drafts = await prepareStudyDrafts(userId, fileId, language === "de" ? "de" : "en", undefined, next);
    return drafts ? { ok: true as const, drafts } : { ok: false as const, error: "NOT_FOUND" };
  } catch (error) { return { ok: false as const, error: error instanceof ValidationError ? error.message : "PREPARE_FAILED" }; }
}

export async function prepareMaterialPlan(fileId: string, language: "en" | "de") {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const, error: "RATE_LIMITED" };
  try {
    const outline = await prepareMaterialOutline(userId, fileId);
    if (outline) return { ok: true as const, outline };
    return await prepareMaterialTasks(fileId, language);
  } catch (error) {
    return { ok: false as const, error: error instanceof ValidationError ? error.message : "PREPARE_FAILED" };
  }
}

export async function recognizeMaterial(fileId: string, force = false) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const, error: "RATE_LIMITED" };
  try {
    const result = await recognizeMaterialOutline(userId, fileId, force === true);
    return result ? { ok: true as const, ...result } : { ok: false as const, error: "NOT_FOUND" };
  } catch { return { ok: false as const, error: "RECOGNITION_FAILED" }; }
}

export async function applyMaterialOutline(fileId: string, outlineId: string, ids: string[], replace: boolean) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const };
  const result = await acceptMaterialOutline(userId, fileId, outlineId, ids, replace);
  if (!result) return { ok: false as const };
  refreshStudy(result.courseId);
  return { ok: true as const, count: result.count };
}

export async function addMaterialTasks(fileId: string, draftId: string, ids: string[], start = false) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const };
  const result = await acceptStudyDrafts(userId, fileId, draftId, ids, start);
  if (!result) return { ok: false as const };
  refreshStudy(result.courseId);
  return { ok: true as const, blockId: result.blockId, allDone: result.allDone };
}

export async function quickStartStudy(data: FormData) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const };
  try {
    const result = await startQuickStudy(userId, { courseId: String(data.get("courseId") ?? ""), topicId: String(data.get("topicId") ?? "") || undefined,
      fileId: String(data.get("fileId") ?? "") || undefined, mode: String(data.get("mode")) as StudyMode,
      minutes: Number(data.get("minutes")), language: data.get("language") === "de" ? "de" : "en", sourceRef: String(data.get("sourceRef") ?? ""),
      sourceCursor: data.get("sourceCursor") ? Number(data.get("sourceCursor")) : undefined });
    if (!result?.blockId) return { ok: false as const };
    refreshStudy(result.courseId);
    return { ok: true as const, blockId: result.blockId };
  } catch (error) { if (error instanceof ValidationError) return { ok: false as const }; throw error; }
}

export async function previewQuickStudySource(courseId: string, fileId: string, topicId?: string, cursor?: number) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const };
  try {
    const sources = await quickStudySources(userId, courseId, fileId, topicId, cursor);
    return sources ? { ok: true as const, ...sources } : { ok: false as const };
  } catch { return { ok: false as const }; }
}

export async function checkpointStudy(data: FormData) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false };
  const result = await saveStudyCheckpoint(userId, { blockId: String(data.get("blockId") ?? ""), response: String(data.get("response") ?? ""),
    topicId: String(data.get("topicId") ?? "") || undefined,
    sessionMinutes: data.has("sessionMinutes") ? Number(data.get("sessionMinutes")) : undefined,
    elapsedSeconds: Number(data.get("elapsedSeconds")), updatedAt: String(data.get("updatedAt") ?? "") });
  if (result && data.get("leaving") === "1") revalidatePath("/today");
  return { ok: !!result };
}
