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
      topicId: String(data.get("topicId") ?? "") || undefined,
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

export async function studyMaterials(courseId: string) {
  const userId = await getCurrentUserId();
  return prisma.moduleFile.findMany({ where: { courseId, course: { userId }, content: { not: null } },
    orderBy: { createdAt: "desc" }, take: 100, select: { id: true, filename: true } });
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
  if (result) revalidatePath("/today");
  return { ok: !!result };
}
