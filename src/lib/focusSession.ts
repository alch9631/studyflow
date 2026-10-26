import { prisma } from "./db";
import { todayISO } from "./planService";
import { quickStudyTask, readStudyTask } from "./studyTask";
import { ValidationError } from "./validate";

/** Starting a timer needs no document extraction, AI or full schedule rebuild. */
export async function startFocusForUser(userId: string, input: { courseId: string; topicId?: string; fileId?: string; language: "en" | "de" }) {
  if (!input || typeof input.courseId !== "string" || !input.courseId || input.courseId.length > 200 ||
      [input.topicId, input.fileId].some((id) => id !== undefined && (typeof id !== "string" || !id || id.length > 200))) return null;
  return prisma.$transaction(async (tx) => {
    const course = await tx.course.findFirst({ where: { id: input.courseId, userId }, select: { id: true, name: true } });
    if (!course) return null;
    const file = input.fileId ? await tx.moduleFile.findFirst({ where: { id: input.fileId, courseId: course.id, content: { not: null } }, select: { id: true, filename: true } }) : null;
    if (input.fileId && !file) return null;
    const select = { id: true, title: true, studyTask: true } as const;
    let topic = input.topicId ? await tx.topic.findFirst({ where: { id: input.topicId, courseId: course.id, done: false }, select }) : null;
    if (input.topicId && !topic) return null;
    if (!topic) {
      if (file) {
        const candidates = await tx.topic.findMany({ where: { courseId: course.id, done: false, studyTask: { contains: file.id } }, orderBy: { order: "asc" }, take: 500, select });
        topic = candidates.find((item) => readStudyTask(item.studyTask)?.sourceFileId === file.id) ?? null;
      } else topic = await tx.topic.findFirst({ where: { courseId: course.id, done: false }, orderBy: { order: "asc" }, select });
    }
    if (!topic) {
      if (await tx.topic.count({ where: { courseId: course.id } }) >= 500) return null;
      const last = await tx.topic.aggregate({ where: { courseId: course.id }, _max: { order: true } });
      topic = await tx.topic.create({ data: { courseId: course.id, title: (file?.filename ?? course.name).slice(0, 200), effort: 0.5,
        order: (last._max.order ?? -1) + 1,
        // Preserve the original file link without inventing a page or parsing a document before the timer.
        studyTask: file ? JSON.stringify(quickStudyTask("read", 30, input.language, { sourceFileId: file.id, sourceRef: file.filename.slice(0, 300) })) : null }, select });
    }
    const existing = await tx.studyBlock.findFirst({ where: { topicId: topic.id, courseId: course.id, completed: false }, orderBy: [{ date: "asc" }, { kind: "desc" }], select: { id: true } });
    if (existing) return { blockId: existing.id };
    const task = readStudyTask(topic.studyTask);
    const block = await tx.studyBlock.create({ data: { courseId: course.id, topicId: topic.id, topicTitle: topic.title,
      date: new Date(todayISO() + "T00:00:00Z"), minutes: task?.estimatedMinutes ?? 30, kind: "study" }, select: { id: true } });
    return { blockId: block.id };
  });
}

/** Finish the session, without claiming the student passed a knowledge check. */
export async function finishFocusForUser(userId: string, input: { blockId: string; topicId: string; elapsedSeconds: number; response: string }) {
  if (!input.blockId || input.blockId.length > 200 || !input.topicId || input.topicId.length > 200 ||
      !Number.isInteger(input.elapsedSeconds) || input.elapsedSeconds < 0 || input.elapsedSeconds > 36000 || input.response.length > 4000) {
    throw new ValidationError("Invalid focus session.");
  }
  return prisma.$transaction(async (tx) => {
    const block = await tx.studyBlock.findFirst({ where: { id: input.blockId, topicId: input.topicId, course: { userId } } });
    // A stale session may not finish a different, newly scheduled block.
    if (!block) return null;
    if (block.completed) return { courseId: block.courseId };
    await tx.studyBlock.update({ where: { id: block.id }, data: { completed: true,
      // Ending early must not credit the unstudied portion of the plan.
      minutes: Math.min(block.minutes, Math.ceil(input.elapsedSeconds / 60)),
      actualMinutes: Math.max(block.actualMinutes ?? 0, Math.floor(input.elapsedSeconds / 60)),
      studyResult: JSON.stringify({ version: 1, outcome: "session", response: input.response.trim(), checked: false,
        requestId: block.id, recordedAt: new Date().toISOString(), plannedMinutes: block.minutes, planUpdated: true }) } });
    await tx.topic.update({ where: { id: block.topicId }, data: { studyProgress: null } });
    return { courseId: block.courseId };
  });
}
