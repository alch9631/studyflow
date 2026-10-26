import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { materialStudyBatch } from "./materialSections";
import { excerptStudyDrafts, groundedStudyDrafts, readStudyDrafts, type StudySection, type StudyDraftSet } from "./studyDraft";
import { isSyllabusAIEnabled, suggestStudyTasks } from "./syllabus";
import { quickStudyTask, readStudyTask, readStudyProgress, type StudyMode } from "./studyTask";
import { rebuildSchedule } from "./planService";
import { saveStudyTaskForUser } from "./studyTaskService";
import { MINUTES_PER_EFFORT, difficultyMultiplier } from "./planner";
import { ValidationError } from "./validate";

/** Resolve an exact, previewable section; never silently attach page one to a topic. */
export async function quickStudySources(userId: string, courseId: string, fileId: string, topicId?: string, cursor?: number) {
  const file = await prisma.moduleFile.findFirst({ where: { id: fileId, courseId, course: { userId }, content: { not: null } },
    select: { filename: true, mimeType: true, content: true } });
  if (!file?.content) return null;
  if (cursor !== undefined && (!Number.isInteger(cursor) || cursor < 1 || cursor > 100000)) throw new ValidationError("Invalid source position.");
  const topic = topicId ? await prisma.topic.findFirst({ where: { id: topicId, courseId, course: { userId } }, select: { title: true } }) : null;
  if (topicId && !topic) return null;
  const history = await prisma.topic.findMany({ where: { courseId, studyTask: { not: null } }, orderBy: { order: "desc" }, take: 500,
    select: { studyTask: true, done: true } });
  const previous = history.map((item) => ({ task: readStudyTask(item.studyTask), done: item.done })).filter((item) => item.task?.sourceFileId === fileId);
  const latest = previous[0];
  let position = cursor ?? Number(/^(?:PDF p\. |Lines )(\d+)/.exec(latest?.task?.sourceRef ?? "")?.[1] ?? 1);
  let batch;
  try { batch = await materialStudyBatch({ ...file, content: file.content }, position); }
  catch { return { sections: [], nextCursor: null, cursor: position, suggested: null, reason: "choose" as const }; }
  // Continue after the last completed section, retaining actual page/line numbers.
  if (cursor === undefined && latest?.done && batch.sections[0]?.reference === latest.task?.sourceRef) {
    if (batch.sections.length > 1) batch = { ...batch, sections: batch.sections.slice(1) };
    else if (batch.nextCursor) { position = batch.nextCursor; batch = await materialStudyBatch({ ...file, content: file.content }, position); }
  }
  const tokens = topic?.title.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const ranked = batch.sections.map((section) => ({ section, score: tokens.filter((token) => section.text.toLocaleLowerCase().includes(token)).length })).sort((a, b) => b.score - a.score);
  const matched = ranked[0]?.score > 0 && ranked[0].score > (ranked[1]?.score ?? 0);
  const suggested = topic ? (matched ? ranked[0].section.reference : null)
    : batch.sections.find((section) => !previous.some((item) => item.done && item.task?.sourceRef === section.reference))?.reference ?? null;
  return { sections: batch.sections, nextCursor: batch.nextCursor, cursor: position, suggested,
    reason: topic ? (matched ? "matched" as const : "choose" as const) : "continue" as const };
}

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
  courseId: string; topicId?: string; fileId?: string; mode: StudyMode; minutes: number; language: "en" | "de"; sourceRef?: string; sourceCursor?: number;
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
  if (file?.content) {
    const sources = await quickStudySources(userId, course.id, input.fileId!, input.topicId, input.sourceCursor);
    const reference = input.sourceRef?.trim() || sources?.suggested;
    section = sources?.sections.find((item) => item.reference === reference);
    if (sources?.sections.length && !section) throw new ValidationError("Choose and preview the section to study.");
    if (!section && !input.sourceRef?.trim()) throw new ValidationError("Enter the pages or exercises to study in the original.");
  }
  const task = quickStudyTask(input.mode, input.minutes, input.language, {
    sourceFileId: input.fileId, sourceRef: input.sourceRef?.trim() || section?.reference || (input.language === "de" ? "Eigene Notizen" : "My own notes"), sourceExcerpt: section?.text,
  });
  {
    const candidates = await prisma.topic.findMany({ where: { courseId: course.id, parentTopicId: existing?.id ?? null, done: false, studyTask: { not: null } }, select: { id: true, studyTask: true } });
    const match = candidates.find((candidate) => {
      const previous = readStudyTask(candidate.studyTask);
      return previous && previous.sourceFileId === task.sourceFileId && previous.sourceRef === task.sourceRef && previous.instruction === task.instruction && previous.estimatedMinutes === task.estimatedMinutes;
    });
    if (match) return { courseId: course.id, blockId: (await nextStudyBlock(userId, match.id))?.id ?? null };
  }
  const activity = input.language === "de" ? { read: "Lesen", solve: "Lösen", recall: "Abrufen" } : { read: "Read", solve: "Solve", recall: "Recall" };
  const title = existing ? `${activity[input.mode]}: ${existing.title} · ${task.sourceRef}` : `${activity[input.mode]}: ${file?.filename ?? (input.language === "de" ? "Eigene Notizen" : "My own notes")}`;
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
