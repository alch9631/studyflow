import { prisma } from "./db";
import { rebuildSchedule, todayISO } from "./planService";
import { quickStudyTask, readStudyProgress, readStudyResult, readStudyTask } from "./studyTask";
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
    if (!input.topicId && !file) {
      // Course starts follow the calendar, rather than restarting its first topic.
      const topics = await tx.topic.findMany({ where: { courseId: course.id, done: false }, select: { id: true, studyProgress: true } });
      const resumed = topics.filter((item) => readStudyProgress(item.studyProgress)).map((item) => item.id);
      const query = { orderBy: [{ date: "asc" as const }, { kind: "desc" as const }, { id: "asc" as const }], select: { id: true, topicId: true, kind: true } as const };
      const next = (resumed.length ? await tx.studyBlock.findFirst({ where: { courseId: course.id, completed: false, topicId: { in: resumed } }, ...query }) : null)
        ?? await tx.studyBlock.findFirst({ where: { courseId: course.id, completed: false, topicId: { in: topics.map((item) => item.id) } }, ...query });
      if (next) return { blockId: next.id, topicId: next.topicId, kind: next.kind };
    }
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
    const existing = await tx.studyBlock.findFirst({ where: { topicId: topic.id, courseId: course.id, completed: false }, orderBy: [{ date: "asc" }, { kind: "desc" }], select: { id: true, kind: true } });
    if (existing) return { blockId: existing.id, topicId: topic.id, kind: existing.kind };
    const task = readStudyTask(topic.studyTask);
    const block = await tx.studyBlock.create({ data: { courseId: course.id, topicId: topic.id, topicTitle: topic.title,
      date: new Date(todayISO() + "T00:00:00Z"), minutes: task?.estimatedMinutes ?? 30, kind: "study" }, select: { id: true } });
    return { blockId: block.id, topicId: topic.id, kind: "study" };
  });
}

/** Resolve explicit links without ever substituting an unrelated task. Read-only for prefetch. */
export async function resolveFocusForUser(userId: string, input: { blockId: string; topicId?: string; kind?: string }) {
  if (!input.blockId || input.blockId.length > 200 || (input.topicId?.length ?? 0) > 200 || input.kind && !["study", "review"].includes(input.kind)) return null;
  const include = { course: { select: { id: true, name: true, examDate: true, userId: true } } } as const;
  let block = await prisma.studyBlock.findUnique({ where: { id: input.blockId }, include });
  if (block) return block.course.userId === userId && (!input.topicId || block.topicId === input.topicId) ? block : null;
  if (!input.topicId) return null;
  const topic = await prisma.topic.findFirst({ where: { id: input.topicId, course: { userId } }, select: { courseId: true } });
  if (!topic) return null;
  block = await prisma.studyBlock.findFirst({ where: { topicId: input.topicId, courseId: topic.courseId, completed: true,
    studyResult: { contains: `"requestId":${JSON.stringify(input.blockId)}` } }, include });
  if (block) return block;
  block = await prisma.studyBlock.findFirst({ where: { topicId: input.topicId, courseId: topic.courseId, completed: false, kind: input.kind },
    orderBy: [{ date: "asc" }, { kind: "desc" }, { id: "asc" }], include });
  // Keep the logical session ID: its paused clock and retries still use that ID.
  return block ? { ...block, id: input.blockId } : null;
}

/** Finish the session, without claiming the student passed a knowledge check. */
export async function finishFocusForUser(userId: string, input: { blockId: string; topicId: string; kind?: string; elapsedSeconds: number; response: string }) {
  if (!input.blockId || input.blockId.length > 200 || !input.topicId || input.topicId.length > 200 ||
      !Number.isInteger(input.elapsedSeconds) || input.elapsedSeconds < 0 || input.elapsedSeconds > 36000 || input.response.length > 4000 || input.kind && !["study", "review"].includes(input.kind)) {
    throw new ValidationError("Invalid focus session.");
  }
  const saved = await prisma.$transaction(async (tx) => {
    let block = await tx.studyBlock.findUnique({ where: { id: input.blockId }, include: { course: { select: { userId: true } } } });
    if (block && (block.course.userId !== userId || block.topicId !== input.topicId)) return null;
    if (!block) {
      // Replanning replaces pending IDs. Look up an earlier submission FIRST so
      // retrying it cannot finish the next session of the same topic.
      block = await tx.studyBlock.findFirst({ where: { topicId: input.topicId, course: { userId }, completed: true,
        studyResult: { contains: `"requestId":${JSON.stringify(input.blockId)}` } }, include: { course: { select: { userId: true } } } })
        ?? await tx.studyBlock.findFirst({ where: { topicId: input.topicId, completed: false, kind: input.kind, course: { userId } },
          orderBy: [{ date: "asc" }, { kind: "desc" }, { id: "asc" }], include: { course: { select: { userId: true } } } });
    }
    if (!block) return null;
    if (block.completed) return { blockId: block.id, courseId: block.courseId, needsReplan: readStudyResult(block.studyResult)?.planUpdated === false };
    if (!await tx.topic.count({ where: { id: block.topicId, courseId: block.courseId, done: false } })) return null;
    const creditedMinutes = Math.min(block.minutes, Math.ceil(input.elapsedSeconds / 60));
    const needsReplan = creditedMinutes !== block.minutes;
    await tx.studyBlock.update({ where: { id: block.id }, data: { completed: true,
      // Ending early must not credit the unstudied portion of the plan.
      minutes: creditedMinutes,
      actualMinutes: Math.max(block.actualMinutes ?? 0, Math.floor(input.elapsedSeconds / 60)),
      studyResult: JSON.stringify({ version: 1, outcome: "session", response: input.response.trim(), checked: false,
        requestId: input.blockId, recordedAt: new Date().toISOString(), plannedMinutes: block.minutes, planUpdated: !needsReplan }) } });
    await tx.topic.update({ where: { id: block.topicId }, data: { studyProgress: null } });
    return { blockId: block.id, courseId: block.courseId, needsReplan };
  });
  if (saved?.needsReplan) {
    // Reinsert the unstudied portion; completing a short session must not erase it.
    await rebuildSchedule(userId);
    const block = await prisma.studyBlock.findUniqueOrThrow({ where: { id: saved.blockId }, select: { studyResult: true } });
    await prisma.studyBlock.update({ where: { id: saved.blockId }, data: {
      studyResult: JSON.stringify({ ...JSON.parse(block.studyResult!), planUpdated: true }),
    } });
  }
  return saved;
}
