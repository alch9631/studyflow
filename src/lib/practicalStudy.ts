import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { materialStudySections, materialStudyBatch } from "./materialSections";
import { excerptStudyDrafts, groundedStudyDrafts, readStudyDrafts, type StudySection, type StudyDraftSet } from "./studyDraft";
import { isSyllabusAIEnabled, suggestStudyTasks } from "./syllabus";
import { quickStudyTask, readStudyTask, readStudyProgress, type StudyMode } from "./studyTask";
import { rebuildSchedule } from "./planService";
import { saveStudyTaskForUser } from "./studyTaskService";
import { MINUTES_PER_EFFORT, difficultyMultiplier } from "./planner";
import { ValidationError } from "./validate";

export async function prepareStudyDrafts(userId: string, fileId: string, language: "en" | "de",
  generate?: (name: string, sections: StudySection[], language: "en" | "de") => Promise<unknown>, next = false) {
  const file = await prisma.moduleFile.findFirst({ where: { id: fileId, course: { userId } },
    select: { id: true, filename: true, mimeType: true, content: true, studyDrafts: true, course: { select: { name: true } } } });
  if (!file?.content) return null;
  const cached = readStudyDrafts(file.studyDrafts);
  if (cached && (!next || !cached.nextCursor)) return cached;
  const cursor = next ? cached?.nextCursor ?? 1 : 1;
  const { sections, nextCursor } = await materialStudyBatch({ ...file, content: file.content }, cursor);
  if (!sections.length) throw new ValidationError("NO_READABLE_TEXT");
  let items = excerptStudyDrafts(sections, file.id, language);
  let method: StudyDraftSet["method"] = "excerpts";
  if (generate || isSyllabusAIEnabled()) {
    try {
      const suggestions = groundedStudyDrafts(await (generate ?? suggestStudyTasks)(file.course.name, sections, language), sections, file.id);
      if (suggestions.length) { items = suggestions; method = "ai"; }
    } catch { console.warn("[study-drafts] AI unavailable; using source excerpts."); }
  }
  const drafts: StudyDraftSet = { version: 1, id: randomUUID(), method, items, cursor, nextCursor };
  // Concurrent first preparations converge; never overwrite accepted suggestions.
  return prisma.$transaction(async (tx) => {
    const current = await tx.moduleFile.findUniqueOrThrow({ where: { id: file.id }, select: { studyDrafts: true } });
    const existing = readStudyDrafts(current.studyDrafts);
    if (existing && (!next || existing.id !== cached?.id)) return existing;
    await tx.moduleFile.update({ where: { id: file.id }, data: { studyDrafts: JSON.stringify(drafts) } });
    return drafts;
  });
}

async function nextStudyBlock(userId: string, topicId: string) {
  return prisma.studyBlock.findFirst({ where: { topicId, completed: false, kind: "study", course: { userId } },
    orderBy: { date: "asc" }, select: { id: true } });
}

export async function acceptStudyDrafts(userId: string, fileId: string, draftId: string, selectedIds: string[], start = false) {
  if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.length > 8 || !selectedIds.every((id) => typeof id === "string" && id.length <= 200)) throw new ValidationError("Choose at least one task.");
  const saved = await prisma.$transaction(async (tx) => {
    const file = await tx.moduleFile.findFirst({ where: { id: fileId, course: { userId } },
      select: { courseId: true, studyDrafts: true, course: { select: { difficulty: true } } } });
    const drafts = readStudyDrafts(file?.studyDrafts);
    if (!file || !drafts || drafts.id !== draftId) return null;
    const selected = drafts.items.filter((item) => selectedIds.includes(item.id));
    if (selected.length !== new Set(selectedIds).size) throw new ValidationError("Reload the task suggestions.");
    const count = await tx.topic.count({ where: { courseId: file.courseId } });
    if (count + selected.filter((item) => !item.topicId).length > 500) throw new ValidationError("This course has reached its task limit.");
    const last = await tx.topic.aggregate({ where: { courseId: file.courseId }, _max: { order: true } });
    let order = (last._max.order ?? -1) + 1;
    for (const item of selected) {
      if (item.topicId && await tx.topic.count({ where: { id: item.topicId, courseId: file.courseId } })) continue;
      const topic = await tx.topic.create({ data: { courseId: file.courseId, title: item.title, order: order++,
        studyTask: JSON.stringify(item.task), effort: item.task.estimatedMinutes / (MINUTES_PER_EFFORT * difficultyMultiplier(file.course.difficulty)) } });
      item.topicId = topic.id;
    }
    await tx.moduleFile.update({ where: { id: fileId }, data: { studyDrafts: JSON.stringify(drafts) } });
    const topics = await tx.topic.findMany({ where: { id: { in: selected.map((item) => item.topicId!) }, courseId: file.courseId }, select: { id: true, done: true, studyProgress: true } });
    const firstItem = selected.find((item) => !topics.find((topic) => topic.id === item.topicId)?.done) ?? selected[0];
    const first = topics.find((topic) => topic.id === firstItem.topicId)!;
    if (start) {
      if (!first.done && !readStudyProgress(first.studyProgress)) await tx.topic.update({ where: { id: firstItem.topicId! }, data: {
        studyProgress: JSON.stringify({ version: 1, response: "", elapsedSeconds: 0, updatedAt: new Date().toISOString(), sessionMinutes: firstItem.task.estimatedMinutes }),
      } });
    }
    return { courseId: file.courseId, topicId: firstItem.topicId!, allDone: topics.every((topic) => topic.done) };
  });
  if (!saved) return null;
  await rebuildSchedule(userId);
  return { ...saved, blockId: (await nextStudyBlock(userId, saved.topicId))?.id ?? null };
}

export async function startQuickStudy(userId: string, input: {
  courseId: string; topicId?: string; fileId?: string; mode: StudyMode; minutes: number; language: "en" | "de"; sourceRef?: string;
}) {
  const course = await prisma.course.findFirst({ where: { id: input.courseId, userId }, select: { id: true } });
  if (!course) return null;
  const existing = input.topicId ? await prisma.topic.findFirst({ where: { id: input.topicId, courseId: course.id }, select: { id: true, title: true, studyTask: true } }) : null;
  if (input.topicId && !existing) return null;
  // Another tab may already have configured this topic. Preserve that work.
  if (existing && readStudyTask(existing.studyTask)) return { courseId: course.id, blockId: (await nextStudyBlock(userId, existing.id))?.id ?? null };
  const file = input.fileId ? await prisma.moduleFile.findFirst({ where: { id: input.fileId, courseId: course.id, content: { not: null } },
    select: { filename: true, mimeType: true, content: true } }) : null;
  if (input.fileId && !file) return null;
  let section;
  if (file?.content && !input.sourceRef?.trim()) {
    try { section = (await materialStudySections({ ...file, content: file.content }))[0]; } catch { /* Originals remain usable even when extraction fails. */ }
  }
  const task = quickStudyTask(input.mode, input.minutes, input.language, {
    sourceFileId: input.fileId, sourceRef: input.sourceRef?.trim() || section?.reference || (input.language === "de" ? "Eigene Notizen" : "My own notes"), sourceExcerpt: section?.text,
  });
  if (!existing) {
    const candidates = await prisma.topic.findMany({ where: { courseId: course.id, done: false, studyTask: { not: null } }, select: { id: true, studyTask: true } });
    const match = candidates.find((candidate) => {
      const previous = readStudyTask(candidate.studyTask);
      return previous && previous.sourceFileId === task.sourceFileId && previous.sourceRef === task.sourceRef && previous.instruction === task.instruction && previous.estimatedMinutes === task.estimatedMinutes;
    });
    if (match) return { courseId: course.id, blockId: (await nextStudyBlock(userId, match.id))?.id ?? null };
  }
  const activity = input.language === "de" ? { read: "Lesen", solve: "Lösen", recall: "Abrufen" } : { read: "Read", solve: "Solve", recall: "Recall" };
  const title = existing?.title ?? `${activity[input.mode]}: ${file?.filename ?? (input.language === "de" ? "Eigene Notizen" : "My own notes")}`;
  const saved = await saveStudyTaskForUser(userId, { courseId: course.id, topicId: existing?.id, title: title.slice(0, 200), task });
  if (!saved) return null;
  await prisma.topic.update({ where: { id: saved.id }, data: { studyProgress: JSON.stringify({ version: 1, response: "", elapsedSeconds: 0, updatedAt: new Date().toISOString(), sessionMinutes: input.minutes }) } });
  return { courseId: course.id, blockId: (await nextStudyBlock(userId, saved.id))?.id ?? null };
}

export async function saveStudyCheckpoint(userId: string, input: { blockId: string; topicId?: string; response: string; elapsedSeconds: number; updatedAt: string; sessionMinutes?: number }) {
  if (!input.blockId || input.blockId.length > 200 || (input.topicId?.length ?? 0) > 200) throw new ValidationError("Invalid saved progress.");
  const progress = readStudyProgress(JSON.stringify({ version: 1, ...input }));
  if (!progress || !Number.isFinite(Date.parse(progress.updatedAt)) || Date.parse(progress.updatedAt) > Date.now() + 300000) throw new ValidationError("Invalid saved progress.");
  return prisma.$transaction(async (tx) => {
    const block = await tx.studyBlock.findFirst({ where: { id: input.blockId, course: { userId } }, select: { topicId: true, completed: true } });
    if (block?.completed || (block && input.topicId && block.topicId !== input.topicId)) return null;
    // A rebuild changes pending block IDs; the owned topic remains stable.
    const topicId = block?.topicId ?? input.topicId;
    if (!topicId) return null;
    if (!block && await tx.studyBlock.count({ where: { topicId, course: { userId },
      studyResult: { contains: `"requestId":${JSON.stringify(input.blockId)}` } } })) return null;
    const topic = await tx.topic.findFirst({ where: { id: topicId, course: { userId }, done: false }, select: { studyProgress: true, courseId: true } });
    if (!topic) return null;
    const previous = readStudyProgress(topic.studyProgress);
    if (previous && previous.updatedAt > progress.updatedAt) return { courseId: topic.courseId };
    await tx.topic.update({ where: { id: topicId }, data: { studyProgress: JSON.stringify({ ...progress, sessionMinutes: progress.sessionMinutes ?? previous?.sessionMinutes }) } });
    return { courseId: topic.courseId };
  });
}
