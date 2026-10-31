import type { MobileBlock, MobileResultInput, MobileToday } from "../../shared/mobile";
import { prisma } from "./db";
import { todayISO } from "./planService";
import { readStudyProgress, readStudyTask } from "./studyTask";
import { recordStudyResult } from "./studyTaskService";
import { saveStudyCheckpoint } from "./practicalStudy";
import { ApiError } from "./apiError";

type StoredBlock = {
  id: string; topicId: string; topicTitle: string; minutes: number; completed: boolean; kind: string;
  course: { id: string; name: string };
};

async function presentBlocks(userId: string, blocks: StoredBlock[]): Promise<MobileBlock[]> {
  const topics = await prisma.topic.findMany({ where: { id: { in: blocks.map((b) => b.topicId) }, course: { userId } },
    select: { id: true, studyTask: true, studyProgress: true } });
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  return blocks.map((block) => {
    const topic = byId.get(block.topicId);
    const task = readStudyTask(topic?.studyTask);
    return { id: block.id, topicId: block.topicId, title: block.topicTitle, minutes: block.minutes,
      completed: block.completed, kind: block.kind, course: block.course,
      task: task ? { instruction: task.instruction, successCriteria: task.successCriteria, sourceRef: task.sourceRef,
        sourceExcerpt: task.sourceExcerpt, sourceFileId: task.sourceFileId, sourceUrl: task.sourceUrl,
        checkQuestion: task.checkQuestion, answerKey: task.answerKey } : null,
      progress: readStudyProgress(topic?.studyProgress) };
  });
}

export async function mobileToday(userId: string): Promise<MobileToday> {
  const date = todayISO();
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start.getTime() + 86400_000);
  const [user, blocks, exam, assignments, lectures] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
    prisma.studyBlock.findMany({ where: { date: { gte: start, lt: end }, course: { userId } },
      select: { id: true, topicId: true, topicTitle: true, minutes: true, completed: true, kind: true, course: { select: { id: true, name: true } } },
      orderBy: [{ kind: "desc" }, { minutes: "desc" }, { id: "asc" }], take: 500 }),
    prisma.course.findFirst({ where: { userId, passed: false, OR: [{ grade: null }, { grade: { gt: 4 } }], examDate: { gte: start } },
      orderBy: { examDate: "asc" }, select: { name: true, examDate: true } }),
    prisma.assignment.findMany({ where: { course: { userId }, done: false, dueDate: { lt: new Date(start.getTime() + 7 * 86400_000) } }, orderBy: { dueDate: "asc" }, take: 100,
      select: { id: true, title: true, dueDate: true, done: true, course: { select: { id: true, name: true } } } }),
    prisma.lecture.findMany({ where: { userId, weekday: start.getUTCDay() }, orderBy: { startMin: "asc" }, select: { id: true, title: true, startMin: true, endMin: true, location: true } }),
  ]);
  return { date, user, blocks: await presentBlocks(userId, blocks),
    summary: { plannedMinutes: blocks.reduce((sum, b) => sum + b.minutes, 0), completedMinutes: blocks.filter((b) => b.completed).reduce((sum, b) => sum + b.minutes, 0),
      completedCount: blocks.filter((b) => b.completed).length, totalCount: blocks.length },
    nextExam: exam ? { name: exam.name, date: exam.examDate.toISOString().slice(0, 10) } : null,
    assignments: assignments.map(a => ({ ...a, dueDate: a.dueDate.toISOString().slice(0, 10) })), lectures };
}

export async function mobileFocus(userId: string, blockId: string) {
  const block = await prisma.studyBlock.findFirst({ where: { id: blockId, course: { userId } },
    select: { id: true, topicId: true, topicTitle: true, minutes: true, completed: true, kind: true, course: { select: { id: true, name: true } } } });
  if (!block) throw new ApiError("NOT_FOUND", "This session is no longer available. Refresh Today.");
  return (await presentBlocks(userId, [block]))[0];
}

export async function mobileSaveProgress(userId: string, blockId: string, input: {
  topicId: string; response: string; elapsedSeconds: number; updatedAt: string;
}) {
  const saved = await saveStudyCheckpoint(userId, { blockId, ...input });
  if (!saved) throw new ApiError("NOT_FOUND", "This session changed. Refresh Today before continuing.");
  return { ok: true };
}

export async function mobileFinish(userId: string, blockId: string, input: MobileResultInput) {
  const block = await mobileFocus(userId, blockId).catch((error: unknown) => {
    if (error instanceof ApiError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (block?.task || !block) {
    const saved = await recordStudyResult(userId, { blockId, ...input });
    if (!saved) throw new ApiError("NOT_FOUND", "This session changed. Refresh Today before continuing.");
  } else {
    if (block.topicId !== input.topicId) throw new ApiError("NOT_FOUND", "Session not found.");
    if (input.outcome !== "complete" || !input.checked) throw new ApiError("BAD_REQUEST", "Confirm that you finished this session.");
    // Explicit completion is idempotent; retries never toggle a finished block off.
    await prisma.$transaction(async (tx) => {
      const changed = await tx.studyBlock.updateMany({ where: { id: blockId, completed: false, course: { userId } },
        data: { completed: true, actualMinutes: input.actualMinutes } });
      if (changed.count && input.response.trim()) {
        const previous = await tx.note.findUnique({ where: { topicId: input.topicId }, select: { body: true } });
        const body = [previous?.body, input.response.trim()].filter(Boolean).join("\n\n");
        await tx.note.upsert({ where: { topicId: input.topicId }, create: { topicId: input.topicId, body }, update: { body } });
      }
      await tx.topic.updateMany({ where: { id: input.topicId, course: { userId } }, data: { studyProgress: null } });
    });
  }
  return { ok: true };
}
