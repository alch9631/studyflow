import { prisma } from "./db";

/**
 * Ownership-scoped data accessors — the single enforcement point for "does the
 * CURRENT user own this row?".
 *
 * Why this exists: server actions resolve the current user (dev-user stand-in
 * today, Supabase later) but then mutated rows by their RAW id (`where: { id }`),
 * trusting a courseId/topicId/blockId straight from the form. That's safe while
 * there's exactly one local user, but the moment real multi-user auth lands it's
 * a cross-user IDOR: user B could delete/replan/toggle user A's rows by guessing
 * an id. These helpers scope every lookup/mutation by the resolved `userId` so a
 * non-owner simply gets `null`/`false` (a no-op), never another user's data.
 *
 * Topic/StudyBlock/Assignment have no direct `userId`; ownership flows through
 * their parent course (`course: { userId }`).
 */

/** True iff `userId` owns this course. */
export async function ownsCourse(userId: string, courseId: string): Promise<boolean> {
  return (await prisma.course.count({ where: { id: courseId, userId } })) > 0;
}

/** The course's `{ id, name }` only if owned by `userId`, else null. */
export function findOwnedCourse(userId: string, courseId: string) {
  return prisma.course.findFirst({
    where: { id: courseId, userId },
    select: { id: true, name: true },
  });
}

/** Update a course only if owned. Returns true iff a row was changed. */
export async function updateOwnedCourse(
  userId: string,
  courseId: string,
  data: Parameters<typeof prisma.course.updateMany>[0]["data"],
): Promise<boolean> {
  const { count } = await prisma.course.updateMany({ where: { id: courseId, userId }, data });
  return count > 0;
}

/** Delete a course only if owned. Returns true iff a row was deleted. */
export async function deleteOwnedCourse(userId: string, courseId: string): Promise<boolean> {
  const { count } = await prisma.course.deleteMany({ where: { id: courseId, userId } });
  return count > 0;
}

/** The topic's toggle-relevant fields only if its course is owned, else null. */
export function findOwnedTopic(userId: string, topicId: string) {
  return prisma.topic.findFirst({
    where: { id: topicId, course: { userId } },
    select: { id: true, done: true, courseId: true },
  });
}

/** The block's progress fields only if its course is owned, else null. */
export function findOwnedBlock(userId: string, blockId: string) {
  return prisma.studyBlock.findFirst({
    where: { id: blockId, course: { userId } },
    select: { id: true, completed: true, actualMinutes: true, minutes: true },
  });
}

/** The assignment's toggle fields only if its course is owned, else null. */
export function findOwnedAssignment(userId: string, assignmentId: string) {
  return prisma.assignment.findFirst({
    where: { id: assignmentId, course: { userId } },
    select: { id: true, done: true, courseId: true },
  });
}

/** Delete an assignment only if its course is owned. Returns true iff deleted. */
export async function deleteOwnedAssignment(userId: string, assignmentId: string): Promise<boolean> {
  const { count } = await prisma.assignment.deleteMany({
    where: { id: assignmentId, course: { userId } },
  });
  return count > 0;
}

/**
 * The module file's revalidation-relevant fields only if its course is owned by
 * `userId`, else null. The owning `courseId` comes from the row, so the delete +
 * revalidate always target the file's real course (never a form-supplied one).
 */
export function findOwnedModuleFile(userId: string, moduleFileId: string) {
  return prisma.moduleFile.findFirst({
    where: { id: moduleFileId, course: { userId } },
    select: { id: true, courseId: true },
  });
}

/**
 * Delete a module file only if its course is owned. Returns the owning
 * `courseId` (for revalidation) when a row was removed, else null — so a guessed
 * moduleFileId can never delete another user's upload.
 */
export async function deleteOwnedModuleFile(
  userId: string,
  moduleFileId: string,
): Promise<string | null> {
  const file = await prisma.moduleFile.findFirst({
    where: { id: moduleFileId, course: { userId } },
    select: { courseId: true },
  });
  if (!file) return null;
  await prisma.moduleFile.deleteMany({ where: { id: moduleFileId } });
  return file.courseId;
}

/**
 * Upsert the (single) note on a topic the current user owns — create on first
 * save, overwrite the body thereafter. No-op (returns null) when the topic isn't
 * owned, so a guessed topicId can never attach a note to another user's course.
 * Returns the owning `courseId` for revalidation, else null.
 */
export async function upsertOwnedTopicNote(
  userId: string,
  topicId: string,
  body: string,
): Promise<string | null> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, course: { userId } },
    select: { courseId: true },
  });
  if (!topic) return null;
  await prisma.note.upsert({
    where: { topicId },
    create: { topicId, body },
    update: { body },
  });
  return topic.courseId;
}

/**
 * Delete a topic's note only if the topic's course is owned. Returns the owning
 * `courseId` (for revalidation) when something was removed, else null.
 */
export async function deleteOwnedTopicNote(
  userId: string,
  topicId: string,
): Promise<string | null> {
  const topic = await prisma.topic.findFirst({
    where: { id: topicId, course: { userId } },
    select: { courseId: true },
  });
  if (!topic) return null;
  await prisma.note.deleteMany({ where: { topicId } });
  return topic.courseId;
}
