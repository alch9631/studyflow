import { readTopicPlanning, topicDeadline } from "./topicPlanning";
import type { MobileBlock, MobileFinishInput, MobileProgressInput, MobileResultInput, MobileToday } from "../../shared/mobile";
import { prisma } from "./db";
import { previewSchedule, todayISO } from "./planService";
import { readStudyProgress, readStudyTask } from "./studyTask";
import { recordStudyResult } from "./studyTaskService";
import { saveStudyCheckpoint } from "./practicalStudy";
import { ApiError } from "./apiError";
import { finishFocusForUser, resolveFocusForUser } from "./focusSession";
import { focusNotesForUser } from "./focusNotes";
import { prioritizeBlocks, pickHero, assignLanes, computeCapacity, canDeferReview, canMoveBlockToTomorrow, recoveryActionPreviews, studyBudget } from "../app/today/cockpit";
import { daysUntil } from "./dates";
import { assessRecovery } from "./recovery";
import { recoveryUndoAvailable } from "./planAdjustment";
import { availableStudyMinutes, parsePrefs } from "./timePlacer";

type StoredBlock = {
  id: string; topicId: string; topicTitle: string; minutes: number; completed: boolean; kind: string;
  course: { id: string; name: string };
};

async function presentBlocks(userId: string, blocks: StoredBlock[]): Promise<MobileBlock[]> {
  const topics = await prisma.topic.findMany({ where: { id: { in: blocks.map((b) => b.topicId) }, course: { userId } },
    select: { id: true, studyTask: true, studyProgress: true, note: { select: { body: true } } } });
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  return blocks.map((block) => {
    const topic = byId.get(block.topicId);
    const task = readStudyTask(topic?.studyTask);
    return { id: block.id, topicId: block.topicId, title: block.topicTitle, minutes: block.minutes,
      completed: block.completed, kind: block.kind, course: { id: block.course.id, name: block.course.name },
      task: task ? { instruction: task.instruction, successCriteria: task.successCriteria, sourceRef: task.sourceRef,
        sourceExcerpt: task.sourceExcerpt, sourceFileId: task.sourceFileId, sourceUrl: task.sourceUrl,
        checkQuestion: task.checkQuestion, answerKey: task.answerKey } : null,
      progress: readStudyProgress(topic?.studyProgress), note: topic?.note?.body ?? "" };
  });
}

export async function mobileToday(userId: string): Promise<MobileToday> {
  const date = todayISO();
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start.getTime() + 86400_000);
  const [user, blocks, exam, assignments, lectures, overdue, proposal] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true, preferences: true, recoverySnapshot: true } }),
    prisma.studyBlock.findMany({ where: { date: { gte: start, lt: end }, course: { userId } },
      select: { id: true, topicId: true, topicTitle: true, minutes: true, completed: true, kind: true, actualMinutes: true, course: { select: { id: true, name: true, examDate: true, assignments: { select: { id: true, dueDate: true, done: true } } } } },
      orderBy: [{ kind: "desc" }, { minutes: "desc" }, { id: "asc" }], take: 500 }),
    prisma.course.findFirst({ where: { userId, passed: false, OR: [{ grade: null }, { grade: { gt: 4 } }], examDate: { gte: start } },
      orderBy: { examDate: "asc" }, select: { name: true, examDate: true } }),
    prisma.assignment.findMany({ where: { course: { userId }, done: false, dueDate: { lt: new Date(start.getTime() + 7 * 86400_000) } }, orderBy: { dueDate: "asc" }, take: 100,
      select: { id: true, title: true, dueDate: true, done: true, course: { select: { id: true, name: true } } } }),
    prisma.lecture.findMany({ where: { userId, weekday: start.getUTCDay() }, orderBy: { startMin: "asc" }, select: { id: true, title: true, startMin: true, endMin: true, location: true } }),
    assessRecovery(userId, date), previewSchedule(userId),
  ]);
  const topics = await prisma.topic.findMany({ where: { course: { userId }, OR: [{ id: { in: blocks.map(b => b.topicId) } }, { done: false, studyProgress: { not: null } }] },
    select: { id: true, order: true, confidence: true, planning: true, studyProgress: true } });
  const byId = new Map(topics.map(t => [t.id, t]));
  const prefs = parsePrefs(user.preferences);
  const ranked = prioritizeBlocks(blocks.map(b => ({ ...b, examDays: daysUntil(b.course.examDate, date),
    importance: readTopicPlanning(byId.get(b.topicId)?.planning).importance,
    deadlineDays: daysUntil(new Date(topicDeadline(b.course.examDate.toISOString().slice(0, 10), readTopicPlanning(byId.get(b.topicId)?.planning), b.course.assignments) + "T00:00:00Z"), date),
    remainingWorkMin: (proposal.get(b.course.id)?.blocks.filter(block => block.kind === "study").reduce((sum, block) => sum + block.minutes, 0) ?? 0) + (proposal.get(b.course.id)?.unscheduled.filter(block => block.kind === "study").reduce((sum, block) => sum + block.minutes, 0) ?? 0), dailyCapacityMin: prefs.dailyBudgetMin,
    confidence: byId.get(b.topicId)?.confidence, topicOrder: byId.get(b.topicId)?.order, progress: readStudyProgress(byId.get(b.topicId)?.studyProgress) })));
  const [hours, minutes] = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).split(":").map(Number);
  const open = ranked.filter(b => !b.completed);
  const availableMinutes = studyBudget(Math.max(0, Math.floor(availableStudyMinutes({ startMin: Math.max(hours * 60 + minutes, prefs.dayStartMin), endMin: prefs.dayEndMin }, lectures) * 0.75)),
    Math.max(0, (prefs.dailyBudgetMin ?? 180) - blocks.filter(b => b.completed).reduce((sum, b) => sum + b.minutes, 0)));
  const hero = pickHero(ranked, assignLanes(ranked, computeCapacity(open.reduce((sum, b) => sum + b.minutes, 0), availableMinutes)));
  const proposed = [...proposal.values()].flatMap(p => p.blocks);
  const rebuilt = proposed.filter(b => b.date === date);
  const movable = (b: (typeof ranked)[number]) => canMoveBlockToTomorrow(start.getTime(), b.course.examDate.getTime());
  const reviews = open.filter(b => b.kind === "review");
  const deferred = reviews.filter(b => movable(b) && canDeferReview(b));
  const overloaded = [...proposal.values()].some(p => p.isOverloaded);
  const previews = recoveryActionPreviews({
    todayStudyMin: open.filter(b => b.kind !== "review").reduce((sum, b) => sum + b.minutes, 0),
    todayReviewMin: reviews.reduce((sum, b) => sum + b.minutes, 0), todayStudyCount: open.length - reviews.length, todayReviewCount: reviews.length,
    movableStudyCount: open.filter(b => b.kind !== "review" && movable(b)).length, allMovableReviewCount: reviews.filter(movable).length,
    movableReviewCount: deferred.length, movableReviewMin: deferred.reduce((sum, b) => sum + b.minutes, 0), immovableMin: open.filter(b => !movable(b)).reduce((sum, b) => sum + b.minutes, 0),
    rebuilt: { count: rebuilt.length, minutes: rebuilt.reduce((sum, b) => sum + b.minutes, 0) }, exam: { isOverloaded: overloaded },
  });
  const latest = topics.map(t => ({ ...t, progress: readStudyProgress(t.studyProgress) })).filter(t => t.progress)
    .sort((a, b) => b.progress!.updatedAt.localeCompare(a.progress!.updatedAt))[0];
  const elsewhere = latest && !blocks.some(b => !b.completed && b.topicId === latest.id)
    ? await prisma.studyBlock.findFirst({ where: { topicId: latest.id, completed: false, kind: "study", course: { userId } }, orderBy: { date: "asc" },
      select: { id: true, topicId: true, topicTitle: true, minutes: true, completed: true, kind: true, course: { select: { id: true, name: true } } } }) : null;
  return { date, user: { name: user.name, email: user.email }, blocks: await presentBlocks(userId, ranked), nextBlockId: elsewhere?.id ?? hero?.id,
    resumeBlock: elsewhere ? (await presentBlocks(userId, [elsewhere]))[0] : null,
    planHealth: { unscheduled: [...proposal.entries()].flatMap(([courseId, plan]) => plan.unscheduled.map(item => ({ ...item, courseId }))), overdueSessions: overdue.overdueSessions, overdueMinutes: overdue.overdueMinutes, availableMinutes, overloaded, undoAvailable: recoveryUndoAvailable(user.recoverySnapshot), previews,
      nextDays: Array.from({ length: 3 }, (_, index) => { const day = new Date(start.getTime() + index * 86400_000).toISOString().slice(0, 10); const planned = proposed.filter(b => b.date === day);
        return { date: day, count: planned.length, minutes: planned.reduce((sum, b) => sum + b.minutes, 0) }; }) },
    summary: { plannedMinutes: blocks.reduce((sum, b) => sum + b.minutes, 0), completedMinutes: blocks.filter((b) => b.completed).reduce((sum, b) => sum + b.minutes, 0),
      completedCount: blocks.filter((b) => b.completed).length, totalCount: blocks.length },
    nextExam: exam ? { name: exam.name, date: exam.examDate.toISOString().slice(0, 10) } : null,
    assignments: assignments.map(a => ({ ...a, dueDate: a.dueDate.toISOString().slice(0, 10) })), lectures };
}

export async function mobileFocus(userId: string, blockId: string, identity: { topicId?: string; kind?: string } = {}) {
  const block = await resolveFocusForUser(userId, { blockId, ...identity });
  if (!block) throw new ApiError("NOT_FOUND", "This session is no longer available. Refresh Today.");
  const result = (await presentBlocks(userId, [block]))[0];
  result.notes = await focusNotesForUser(userId, block.topicId);
  result.fileAvailable = !!result.task?.sourceFileId && await prisma.moduleFile.count({ where: { id: result.task.sourceFileId, courseId: block.courseId, content: { not: null } } }) > 0;
  return result;
}

export async function mobileSaveProgress(userId: string, blockId: string, input: MobileProgressInput) {
  const saved = await saveStudyCheckpoint(userId, { blockId, ...input });
  if (!saved) throw new ApiError("NOT_FOUND", "This session changed. Refresh Today before continuing.");
  return { ok: true };
}

/** Match the web timer: ending a sitting records time without asserting mastery. */
export async function mobileFinishSession(userId: string, blockId: string, input: MobileFinishInput) {
  if (!await finishFocusForUser(userId, { blockId, ...input })) throw new ApiError("NOT_FOUND", "This session changed. Refresh Today before continuing.");
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
