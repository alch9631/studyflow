import { prisma } from "./db";
import { availableMaterialIds } from "./materials";
import { readStudyTask, taskSourceHref } from "./studyTask";
import type { PracticeCard, PracticeData } from "../../shared/mobileWorkspace";

export function parseExamQuestions(raw: string | null): { question: string; topic: string }[] {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!Array.isArray(value?.examQuestions)) return [];
    return value.examQuestions.flatMap((item: { question?: unknown; topic?: unknown } | null) =>
      typeof item?.question === "string" && item.question.trim() ? [{ question: item.question.trim(), topic: typeof item.topic === "string" ? item.topic : "" }] : []);
  } catch { return []; }
}

/** The same source-backed recall queue serves the web and native clients. */
export async function practiceForUser(userId: string, courseId: string, examFileId = ""): Promise<PracticeData | null> {
  const course = await prisma.course.findFirst({ where: { id: courseId, userId }, select: { id: true, name: true,
    topics: { orderBy: { order: "asc" }, select: { id: true, title: true, questions: true, confidence: true, studyTask: true } } } });
  if (!course) return null;
  const originalIds = new Set((await availableMaterialIds(userId, courseId)).map(file => file.id));
  const cards: PracticeCard[] = [];
  const confidence = (value: string | null): PracticeCard["confidence"] => value === "solid" || value === "practice" || value === "struggling" ? value : null;
  let courseName = course.name;
  if (examFileId) {
    const file = await prisma.moduleFile.findFirst({ where: { id: examFileId, courseId }, select: { filename: true, analysis: true } });
    courseName = file?.filename ?? courseName;
    const byTitle = new Map(course.topics.map(topic => [topic.title.trim().toLowerCase(), topic]));
    for (const item of parseExamQuestions(file?.analysis ?? null)) {
      const topic = byTitle.get(item.topic.trim().toLowerCase()) ?? course.topics[0];
      if (!topic) break;
      const sourceFileId = originalIds.has(examFileId) ? examFileId : null;
      cards.push({ topicId: topic.id, topicTitle: item.topic.trim() || topic.title, question: item.question, confidence: confidence(topic.confidence),
        sourceFileId, sourceHref: sourceFileId ? `/api/materials/${encodeURIComponent(sourceFileId)}` : null });
    }
  } else for (const topic of course.topics) {
    const task = readStudyTask(topic.studyTask);
    const source = { sourceFileId: task?.sourceFileId && originalIds.has(task.sourceFileId) ? task.sourceFileId : null,
      sourceUrl: task?.sourceUrl, sourceHref: task ? taskSourceHref(task, !!task.sourceFileId && originalIds.has(task.sourceFileId)) : null };
    const card = { topicId: topic.id, topicTitle: topic.title, confidence: confidence(topic.confidence), ...source };
    if (task?.checkQuestion && task.answerKey) cards.push({ ...card, question: task.checkQuestion, answerKey: task.answerKey });
    try {
      const questions = JSON.parse(topic.questions ?? "[]");
      if (Array.isArray(questions)) for (const question of questions) if (typeof question === "string" && question.trim()) cards.push({ ...card, question });
    } catch { /* Older or malformed question data has no recall cards. */ }
  }
  return { courseId, courseName, cards };
}
