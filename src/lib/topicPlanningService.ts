import { prisma } from "./db";
import { validatePrerequisites, validateTopicPlanning } from "./topicPlanning";
import { ValidationError } from "./validate";
import { rebuildSchedule } from "./planService";

export async function saveTopicPlanningForUser(userId: string, topicId: string, input: Record<string, unknown>) {
  const planning = validateTopicPlanning(input);
  const saved = await prisma.$transaction(async tx => {
    const topic = await tx.topic.findFirst({ where: { id: topicId, course: { userId } }, select: { courseId: true } });
    if (!topic) return false;
    const topics = await tx.topic.findMany({ where: { courseId: topic.courseId }, select: { id: true, planning: true } });
    validatePrerequisites(topicId, planning, topics);
    if (planning.assignmentId && !await tx.assignment.count({ where: { id: planning.assignmentId, courseId: topic.courseId } })) {
      throw new ValidationError("Choose an assignment from this course.");
    }
    await tx.topic.update({ where: { id: topicId }, data: { planning: JSON.stringify(planning) } });
    return true;
  });
  if (saved) await rebuildSchedule(userId);
  return saved;
}
