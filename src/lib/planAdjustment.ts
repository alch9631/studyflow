import { createHash } from "node:crypto";
import { prisma } from "./db";

async function planState(userId: string) {
  const [blocks, courses, topics, user, lectures] = await Promise.all([
    prisma.studyBlock.findMany({ where: { course: { userId } }, orderBy: { id: "asc" } }),
    prisma.course.findMany({ where: { userId }, orderBy: { id: "asc" }, select: { id: true, intense: true, minutesPerDay: true, examDate: true, studyDays: true } }),
    prisma.topic.findMany({ where: { course: { userId } }, orderBy: { id: "asc" }, select: { id: true, done: true, confidence: true, effort: true, studyTask: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } }),
    prisma.lecture.findMany({ where: { userId }, orderBy: { id: "asc" } }),
  ]);
  return { blocks, courses, topics, preferences: user.preferences, lectures };
}
type PlanState = Awaited<ReturnType<typeof planState>>;
const fingerprint = (state: unknown) => createHash("sha256").update(JSON.stringify(state)).digest("hex");

/** Only the last adjustment is undoable, while all planning inputs still match. */
export async function withRecoveryUndo<T>(userId: string, adjust: () => Promise<T>): Promise<T> {
  const before = await planState(userId);
  const result = await adjust();
  const after = await planState(userId);
  if (fingerprint(before) !== fingerprint(after)) {
    const snapshot = JSON.stringify({ version: 1, expiresAt: Date.now() + 30 * 60_000,
      before: { blocks: before.blocks.filter((block) => !block.completed), courses: before.courses },
      after: fingerprint(after) });
    await prisma.user.update({ where: { id: userId }, data: { recoverySnapshot: snapshot.length <= 2_000_000 ? snapshot : null } });
  }
  return result;
}

export function recoveryUndoAvailable(raw: string | null | undefined): boolean {
  try { const value = JSON.parse(raw ?? "null"); return value?.version === 1 && value.expiresAt > Date.now(); }
  catch { return false; }
}

export async function undoPlanAdjustment(userId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { recoverySnapshot: true } });
    if (!recoveryUndoAvailable(user.recoverySnapshot)) return false;
    const snapshot = JSON.parse(user.recoverySnapshot!) as { before: Pick<PlanState, "blocks" | "courses">; after: string };
    // The state read and comparison must share the transaction with restoration.
    const [blocks, courses, topics, preferences, lectures] = await Promise.all([
      tx.studyBlock.findMany({ where: { course: { userId } }, orderBy: { id: "asc" } }),
      tx.course.findMany({ where: { userId }, orderBy: { id: "asc" }, select: { id: true, intense: true, minutesPerDay: true, examDate: true, studyDays: true } }),
      tx.topic.findMany({ where: { course: { userId } }, orderBy: { id: "asc" }, select: { id: true, done: true, confidence: true, effort: true, studyTask: true } }),
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } }),
      tx.lecture.findMany({ where: { userId }, orderBy: { id: "asc" } }),
    ]);
    if (fingerprint({ blocks, courses, topics, preferences: preferences.preferences, lectures }) !== snapshot.after) {
      await tx.user.update({ where: { id: userId }, data: { recoverySnapshot: null } });
      return false;
    }
    await tx.studyBlock.deleteMany({ where: { completed: false, course: { userId } } });
    if (snapshot.before.blocks.length) await tx.studyBlock.createMany({ data: snapshot.before.blocks.map((block) => ({ ...block,
      date: new Date(block.date), startTime: block.startTime ? new Date(block.startTime) : null, endTime: block.endTime ? new Date(block.endTime) : null,
    })) });
    for (const course of snapshot.before.courses) await tx.course.update({ where: { id: course.id }, data: { intense: course.intense, minutesPerDay: course.minutesPerDay } });
    await tx.user.update({ where: { id: userId }, data: { recoverySnapshot: null } });
    return true;
  });
}
