import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { classifyTextSource } from "./fileText";
import { detectDocumentOutline, outlineUnits, outlineTopicTitle, readMaterialOutline, type MaterialOutline, type DocumentPage } from "./documentOutline";
import { ValidationError } from "./validate";
import { LIMITS } from "./limits";
import { MINUTES_PER_EFFORT } from "./planner";
import { rebuildSchedule } from "./planService";
import { topicIdsSafeToDelete } from "./moduleUpload";
import { readStudyTask } from "./studyTask";

function analysisObject(raw: string | null): Record<string, unknown> {
  try { const p = JSON.parse(raw ?? "{}"); return p && typeof p === "object" && !Array.isArray(p) ? p : {}; } catch { return {}; }
}

export async function extractMaterialOutline(file: { filename: string; mimeType: string | null; content: Uint8Array }): Promise<{ outline: MaterialOutline | null; extractedChars: number }> {
  const kind = classifyTextSource(file.filename, file.mimeType);
  let pages: DocumentPage[];
  if (kind === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(file.content) });
    try { pages = (await parser.getText()).pages; } finally { await parser.destroy(); }
  } else {
    const text = kind === "docx" ? (await (await import("mammoth")).extractRawText({ buffer: Buffer.from(file.content) })).value
      : Buffer.from(file.content).toString("utf8");
    pages = [{ num: 1, text }];
  }
  const extractedChars = pages.reduce((n, page) => n + page.text.length, 0);
  const detected = detectDocumentOutline(pages, kind === "pdf");
  if (!detected) return { outline: null, extractedChars };
  const totalPages = kind === "pdf" ? pages.length : null;
  const units = outlineUnits(detected, totalPages, pages.reduce((n, page) => n + page.text.split("\n").length, 0));
  if (units.length > LIMITS.MAX_TOPICS_PER_COURSE || detected.entries.length > 2000) throw new ValidationError("OUTLINE_TOO_LARGE");
  return { extractedChars, outline: { ...detected, version: 1, id: randomUUID(), totalPages, units } };
}

/** No provider call and no topic mutation: the student reviews the entire outline first. */
export async function prepareMaterialOutline(userId: string, fileId: string, force = false) {
  const file = await prisma.moduleFile.findFirst({ where: { id: fileId, course: { userId } },
    select: { filename: true, mimeType: true, content: true, analysis: true, category: true } });
  if (!file?.content) return null;
  // Problem sheets and exams retain their exercise-oriented preparation.
  if (["uebung", "altklausur", "mockexam"].includes(file.category ?? "")) return null;
  const cached = readMaterialOutline(file.analysis);
  if (cached && !force) return cached;
  const result = await extractMaterialOutline({ ...file, content: file.content });
  if (!result.outline) return null;
  return prisma.$transaction(async (tx) => {
    const current = await tx.moduleFile.findFirst({ where: { id: fileId, course: { userId } }, select: { analysis: true } });
    if (!current) return null;
    const existing = readMaterialOutline(current.analysis);
    if (existing && !force) return existing;
    await tx.moduleFile.update({ where: { id: fileId }, data: { extractedChars: result.extractedChars,
      analysis: JSON.stringify({ ...analysisObject(current.analysis), outline: result.outline }) } });
    return result.outline;
  });
}

/** Reconcile the reviewed structure while preserving all work a student invested in. */
export async function acceptMaterialOutline(userId: string, fileId: string, outlineId: string, unitIds: string[], replace = false) {
  if (!Array.isArray(unitIds) || !unitIds.length || unitIds.length > 500 || !unitIds.every((id) => typeof id === "string" && id.length <= 200)) throw new ValidationError("Choose sections for your plan.");
  const result = await prisma.$transaction(async (tx) => {
    const file = await tx.moduleFile.findFirst({ where: { id: fileId, course: { userId } }, select: { courseId: true, analysis: true } });
    const outline = readMaterialOutline(file?.analysis);
    if (!file || !outline || outline.id !== outlineId) return null;
    const selected = outline.units.filter((unit) => unitIds.includes(unit.id));
    if (selected.length !== new Set(unitIds).size) throw new ValidationError("Reload the chapter preview.");
    const existing = await tx.topic.findMany({ where: { courseId: file.courseId }, orderBy: { order: "asc" },
      select: { id: true, title: true, order: true, parentTopicId: true, done: true, confidence: true, studyTask: true, tasks: { select: { id: true }, take: 1 } } });
    const existingIds = new Set(existing.map((topic) => topic.id));
    const byTitle = new Map(existing.filter((topic) => !topic.parentTopicId).map((topic) => [topic.title.trim().toLocaleLowerCase(), topic]));
    const kept = new Set<string>();
    const planned = selected.map((unit) => {
      const title = outlineTopicTitle(unit);
      const previous = unit.topicId && existingIds.has(unit.topicId) ? existing.find((topic) => topic.id === unit.topicId)
        : byTitle.get(title.toLocaleLowerCase());
      if (previous) kept.add(previous.id);
      return { unit, title, previous };
    });
    const dropped = replace ? existing.filter((topic) => !kept.has(topic.id) && !topic.parentTopicId) : [];
    const droppedIds = dropped.map((topic) => topic.id);
    const notes = droppedIds.length ? await tx.note.findMany({ where: { topicId: { in: droppedIds } }, select: { topicId: true } }) : [];
    const studied = droppedIds.length ? await tx.studyBlock.findMany({ where: { topicId: { in: droppedIds }, completed: true }, select: { topicId: true } }) : [];
    const safe = topicIdsSafeToDelete(dropped, notes.map((n) => n.topicId), studied.map((b) => b.topicId));
    const newCount = planned.filter((p) => !p.previous).length;
    if (existing.length - safe.length + newCount > LIMITS.MAX_TOPICS_PER_COURSE) throw new ValidationError("This course has reached its topic limit.");
    if (safe.length) await tx.topic.deleteMany({ where: { id: { in: safe } } });
    const base = replace ? 0 : Math.max(-1, ...existing.map((topic) => topic.order)) + 1;
    for (const [index, item] of planned.entries()) {
      const topic = item.previous ?? await tx.topic.create({ data: { courseId: file.courseId, title: item.title,
        order: base + index, effort: item.unit.estimatedMinutes / MINUTES_PER_EFFORT } });
      if (item.previous && replace) await tx.topic.update({ where: { id: topic.id }, data: { order: index } });
      item.unit.topicId = topic.id;
      kept.add(topic.id);
    }
    // Earlier excerpt batches may already have produced small tasks called
    // "Chapter 1" or "Chapter 2". Keep their IDs, responses and completion,
    // and attach them to the section their exact source actually belongs to.
    for (const topic of existing) {
      if (topic.parentTopicId || kept.has(topic.id)) continue;
      const task = readStudyTask(topic.studyTask);
      if (task?.sourceFileId !== fileId) continue;
      const page = Number(/^PDF p\. (\d+)/.exec(task.sourceRef)?.[1]);
      const line = Number(/^Lines (\d+)/.exec(task.sourceRef)?.[1]);
      const parent = selected.find((unit) => page && unit.page && page >= unit.page && page <= (unit.endPage ?? unit.page)
        || line && unit.line && line >= unit.line && line <= (unit.endLine ?? unit.line));
      if (parent?.topicId) await tx.topic.update({ where: { id: topic.id }, data: { parentTopicId: parent.topicId } });
    }
    if (replace) {
      let tail = planned.length;
      for (const topic of existing) if (!kept.has(topic.id) && !safe.includes(topic.id)) await tx.topic.update({ where: { id: topic.id }, data: { order: tail++ } });
    }
    await tx.moduleFile.update({ where: { id: fileId }, data: { analysis: JSON.stringify({ ...analysisObject(file.analysis), outline }) } });
    return { courseId: file.courseId, count: planned.length };
  });
  if (result) await rebuildSchedule(userId);
  return result;
}
