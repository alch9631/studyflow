import { prisma } from "./db";
import { readTopicPlanning } from "./topicPlanning";

/** Delete one owned topic and its future work, retaining completed study history. */
export async function deleteTopicForUser(userId: string, topicId: string) {
  return prisma.$transaction(async (tx) => {
    const topic = await tx.topic.findFirst({ where: { id: topicId, course: { userId } }, select: { courseId: true } });
    if (!topic) return null;
    // A partly studied session is history too; retain its actual logged minutes.
    const logged = await tx.studyBlock.findMany({ where: { courseId: topic.courseId, topicId, completed: false, actualMinutes: { gt: 0 } }, select: { id: true, actualMinutes: true } });
    for (const block of logged) await tx.studyBlock.update({ where: { id: block.id }, data: { completed: true, minutes: block.actualMinutes! } });
    await tx.studyBlock.deleteMany({ where: { courseId: topic.courseId, topicId, completed: false } });
    // Notes belong to this topic; child topics remain with their own work and notes.
    await tx.topic.delete({ where: { id: topicId } });
    const dependents = await tx.topic.findMany({ where: { courseId: topic.courseId, planning: { not: null } }, select: { id: true, planning: true } });
    for (const dependent of dependents) {
      const planning = readTopicPlanning(dependent.planning);
      if (planning.prerequisites.includes(topicId)) await tx.topic.update({ where: { id: dependent.id },
        data: { planning: JSON.stringify({ ...planning, prerequisites: planning.prerequisites.filter(id => id !== topicId) }) } });
    }
    return topic.courseId;
  });
}
