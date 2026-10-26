import { prisma } from "./db";
import { readStudyTask, readStudyResult, validateStudyTask } from "./studyTask";
import { ValidationError } from "./validate";
import { calibrationFromHistory, rebuildSchedule } from "./planService";
import { difficultyMultiplier, MINUTES_PER_EFFORT } from "./planner";

export async function saveStudyTaskForUser(userId: string, input: {
  courseId: string; topicId?: string; title: string; task: Record<string, unknown>;
}) {
  const task = validateStudyTask(input.task);
  const title = input.title.trim();
  if (!title || title.length > 200) throw new ValidationError("Give the task a short title.");
  const course = await prisma.course.findFirst({ where: { id: input.courseId, userId }, select: { id: true, difficulty: true } });
  if (!course) return null;
  const topic = await prisma.$transaction(async (tx) => {
    if (task.sourceFileId && !await tx.moduleFile.count({ where: { id: task.sourceFileId, courseId: course.id } })) {
      throw new ValidationError("Choose a material belonging to this course.");
    }
    if (input.topicId && !await tx.topic.count({ where: { id: input.topicId, courseId: course.id } })) return null;
    const data = {
      title, studyTask: JSON.stringify(task),
      effort: task.estimatedMinutes / (MINUTES_PER_EFFORT * difficultyMultiplier(course.difficulty)),
    };
    if (input.topicId) return tx.topic.update({ where: { id: input.topicId }, data, select: { id: true } });
    const count = await tx.topic.count({ where: { courseId: course.id } });
    if (count >= 500) throw new ValidationError("This course has reached its task limit.");
    const last = await tx.topic.aggregate({ where: { courseId: course.id }, _max: { order: true } });
    return tx.topic.create({ data: { ...data, courseId: course.id, order: (last._max.order ?? -1) + 1 }, select: { id: true } });
  });
  if (topic) await rebuildSchedule(userId);
  return topic;
}

export type StudyOutcome = "complete" | "practice";

/** A checked result changes the plan; elapsed time alone never finishes a task. */
export async function recordStudyResult(userId: string, input: {
  blockId: string; outcome: StudyOutcome; response: string; checked: boolean; actualMinutes: number;
}) {
  if (!["complete", "practice"].includes(input.outcome) || input.response.length > 4000 ||
      !Number.isInteger(input.actualMinutes) || input.actualMinutes < 0 || input.actualMinutes > 600) {
    throw new ValidationError("Please check the study result.");
  }
  const saved = await prisma.$transaction(async (tx) => {
    const block = await tx.studyBlock.findFirst({
      where: { id: input.blockId, course: { userId } },
      include: { course: { select: { difficulty: true } } },
    });
    if (!block) return null;
    const topic = await tx.topic.findFirst({ where: { id: block.topicId, courseId: block.courseId } });
    const task = readStudyTask(topic?.studyTask);
    if (!topic || !task) throw new ValidationError("Define the study task first.");
    if (input.outcome === "complete" && (!input.checked || (task.checkQuestion && !input.response.trim()))) {
      throw new ValidationError("Check your result against the goal before finishing.");
    }
    // Retrying a saved submission must never add study time or extra work twice.
    if (block.studyResult) return { courseId: block.courseId, alreadySaved: true, needsReplan: !readStudyResult(block.studyResult)?.planUpdated };
    const result = JSON.stringify({ version: 1, outcome: input.outcome, response: input.response.trim(),
      checked: input.checked, recordedAt: new Date().toISOString(), planUpdated: false });
    await tx.studyBlock.update({ where: { id: block.id }, data: {
      completed: true, studyResult: result,
      actualMinutes: Math.max(block.actualMinutes ?? 0, input.actualMinutes),
    } });
    let effort = topic.effort;
    if (input.outcome === "practice") {
      const history = await tx.studyBlock.findMany({ where: { courseId: block.courseId } });
      const scale = difficultyMultiplier(block.course.difficulty) * calibrationFromHistory(history);
      const studied = history.filter((b) => b.topicId === topic.id && b.completed && b.kind === "study")
        .reduce((sum, b) => sum + b.minutes, 0);
      // Keep at least one 15-minute practice task outstanding, even if the
      // student's first attempt already used the original time estimate.
      effort = Math.max(effort, (studied + 15) / (MINUTES_PER_EFFORT * scale));
    }
    await tx.topic.update({ where: { id: topic.id }, data: {
      done: input.outcome === "complete", confidence: input.outcome === "complete" ? "solid" : "struggling", effort,
    } });
    return { courseId: block.courseId, alreadySaved: false, needsReplan: true };
  });
  if (saved?.needsReplan) {
    await rebuildSchedule(userId);
    const block = await prisma.studyBlock.findUniqueOrThrow({ where: { id: input.blockId }, select: { studyResult: true } });
    await prisma.studyBlock.update({ where: { id: input.blockId }, data: {
      studyResult: JSON.stringify({ ...JSON.parse(block.studyResult!), planUpdated: true }),
    } });
  }
  return saved;
}
