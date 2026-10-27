import { prisma } from "./db";
import { ValidationError } from "./validate";

export type FocusNoteEntry = { id: string; body: string; createdAt: string; updatedAt: string };
type Row = { id: string; body: string; createdAt: Date; updatedAt: Date };
const entry = (row: Row, prefix = ""): FocusNoteEntry => ({ ...row, id: prefix + row.id, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
function sessionEntry(block: { id: string; date: Date; studyResult: string | null }): FocusNoteEntry | null {
  try {
    const result = JSON.parse(block.studyResult ?? "null");
    if (result?.version !== 1 || result.outcome !== "session" || typeof result.response !== "string" || !result.response.trim()) return null;
    const createdAt = Number.isFinite(Date.parse(result.recordedAt)) ? new Date(result.recordedAt).toISOString() : block.date.toISOString();
    return { id: `session:${block.id}`, body: result.response, createdAt,
      updatedAt: Number.isFinite(Date.parse(result.notesUpdatedAt)) ? new Date(result.notesUpdatedAt).toISOString() : createdAt };
  } catch { return null; }
}

/** Read-only, including the notes written before separate entries were available. */
export async function focusNotesForUser(userId: string, topicId: string): Promise<FocusNoteEntry[]> {
  const topic = await prisma.topic.findFirst({ where: { id: topicId, course: { userId } },
    select: { note: true, focusNotes: { orderBy: { createdAt: "desc" }, take: 500 } } });
  if (!topic) return [];
  const sessions = await prisma.studyBlock.findMany({ where: { topicId, course: { userId }, completed: true, studyResult: { not: null } },
    orderBy: { date: "desc" }, take: 500, select: { id: true, date: true, studyResult: true } });
  return [...topic.focusNotes.map((note) => entry(note)),
    ...(topic.note?.body.trim() ? [entry(topic.note, "topic:")] : []),
    ...sessions.map(sessionEntry).filter((note): note is FocusNoteEntry => !!note)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

function validate(input: { topicId: string; id: string; body: string }, max = 4000) {
  if (!input || typeof input.topicId !== "string" || !input.topicId || input.topicId.length > 200 ||
      typeof input.id !== "string" || !input.id || input.id.length > 200 || typeof input.body !== "string" || !input.body.trim() || input.body.length > max) {
    throw new ValidationError("Write a note before saving.");
  }
}

export async function addFocusNoteForUser(userId: string, input: { topicId: string; id: string; body: string }) {
  validate(input);
  if (!/^[\w-]+$/.test(input.id)) throw new ValidationError("Invalid note.");
  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.findFirst({ where: { id: input.topicId, course: { userId } }, select: { courseId: true } });
    if (!topic) return { ok: false as const, reason: "missing" as const };
    const previous = await tx.focusNote.findUnique({ where: { id: input.id } });
    if (previous) return previous.topicId === input.topicId ? { ok: true as const, note: entry(previous), courseId: topic.courseId } : { ok: false as const, reason: "missing" as const };
    if (await tx.focusNote.count({ where: { topicId: input.topicId } }) >= 500) return { ok: false as const, reason: "limit" as const };
    const saved = await tx.focusNote.create({ data: { id: input.id, topicId: input.topicId, body: input.body.trim() } });
    return { ok: true as const, note: entry(saved), courseId: topic.courseId };
  });
}

/** Compare the saved timestamp so a stale editor cannot silently erase a newer note. */
export async function updateFocusNoteForUser(userId: string, input: { topicId: string; id: string; body: string; updatedAt: string }) {
  validate(input, typeof input?.id === "string" && input.id.startsWith("topic:") ? 10000 : 4000);
  if (typeof input.updatedAt !== "string" || !Number.isFinite(Date.parse(input.updatedAt))) throw new ValidationError("Invalid note.");
  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.findFirst({ where: { id: input.topicId, course: { userId } }, select: { courseId: true } });
    if (!topic) return { ok: false as const, reason: "missing" as const };
    const now = new Date(Math.max(Date.now(), Date.parse(input.updatedAt) + 1));
    let saved: FocusNoteEntry | null = null;
    if (input.id.startsWith("session:")) {
      const block = await tx.studyBlock.findFirst({ where: { id: input.id.slice(8), topicId: input.topicId, completed: true, course: { userId } } });
      const current = block && sessionEntry(block);
      if (!block || !current) return { ok: false as const, reason: "missing" as const };
      if (current.updatedAt !== input.updatedAt) return { ok: false as const, reason: "conflict" as const, note: current };
      const result = JSON.stringify({ ...JSON.parse(block.studyResult!), response: input.body.trim(), notesUpdatedAt: now.toISOString() });
      await tx.studyBlock.update({ where: { id: block.id }, data: { studyResult: result } });
      saved = sessionEntry({ ...block, studyResult: result });
    } else if (input.id.startsWith("topic:")) {
      const current = await tx.note.findFirst({ where: { id: input.id.slice(6), topicId: input.topicId } });
      if (!current) return { ok: false as const, reason: "missing" as const };
      if (current.updatedAt.toISOString() !== input.updatedAt) return { ok: false as const, reason: "conflict" as const, note: entry(current, "topic:") };
      saved = entry(await tx.note.update({ where: { id: current.id }, data: { body: input.body.trim(), updatedAt: now } }), "topic:");
    } else {
      const current = await tx.focusNote.findFirst({ where: { id: input.id, topicId: input.topicId } });
      if (!current) return { ok: false as const, reason: "missing" as const };
      if (current.updatedAt.toISOString() !== input.updatedAt) return { ok: false as const, reason: "conflict" as const, note: entry(current) };
      saved = entry(await tx.focusNote.update({ where: { id: current.id }, data: { body: input.body.trim(), updatedAt: now } }));
    }
    return { ok: true as const, note: saved!, courseId: topic.courseId };
  });
}
