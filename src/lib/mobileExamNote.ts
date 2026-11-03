import { prisma } from "./db";
import { ValidationError } from "./validate";

export type ExamNote = { body: string; updatedAt: string | null };

/** Save only the owned module revision the editor loaded; a clear also advances it. */
export async function saveExamNoteForUser(userId: string, input: { courseId: string; body: string; updatedAt: string }) {
  if (!input || typeof input.courseId !== "string" || !input.courseId || input.courseId.length > 200 ||
      typeof input.body !== "string" || input.body.length > 4000 || typeof input.updatedAt !== "string" || input.updatedAt.length > 40 ||
      (input.updatedAt !== "" && (!Number.isFinite(Date.parse(input.updatedAt)) || new Date(input.updatedAt).toISOString() !== input.updatedAt))) {
    throw new ValidationError("Check the note and try again. Notes can contain up to 4,000 characters.");
  }
  const current = await prisma.course.findFirst({ where: { id: input.courseId, userId }, select: { examNote: true, examNoteUpdatedAt: true } });
  if (!current) return { ok: false as const, reason: "not-found" as const };
  const revision = current.examNoteUpdatedAt?.toISOString() ?? "";
  if (revision !== input.updatedAt) return { ok: false as const, reason: "note-conflict" as const };
  const updatedAt = new Date(Math.max(Date.now(), (current.examNoteUpdatedAt?.getTime() ?? 0) + 1));
  const body = input.body.trim();
  // The revision predicate is part of the write, so concurrent editors cannot both win.
  const saved = await prisma.course.updateMany({ where: { id: input.courseId, userId, examNoteUpdatedAt: current.examNoteUpdatedAt },
    data: { examNote: body || null, examNoteUpdatedAt: updatedAt } });
  if (!saved.count) return { ok: false as const, reason: "note-conflict" as const };
  return { ok: true as const, note: { body, updatedAt: updatedAt.toISOString() } satisfies ExamNote };
}
