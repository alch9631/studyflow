import { isValidISODate, ValidationError } from "./validate";

export type TopicPlanning = { version: 1; prerequisites: string[]; importance: number; assignmentId: string | null; dueDate: string | null };
export const DEFAULT_TOPIC_PLANNING: TopicPlanning = { version: 1, prerequisites: [], importance: 3, assignmentId: null, dueDate: null };

export function validateTopicPlanning(value: Record<string, unknown>): TopicPlanning {
  const prerequisites = value.prerequisites ?? [];
  const importance = Number(value.importance ?? 3);
  const dueDate = typeof value.dueDate === "string" && value.dueDate ? value.dueDate : null;
  if (!Array.isArray(prerequisites) || prerequisites.length > 100 || prerequisites.some(id => typeof id !== "string" || !id || id.length > 200) ||
      !Number.isInteger(importance) || importance < 1 || importance > 5 || dueDate && !isValidISODate(dueDate)) {
    throw new ValidationError("Check the prerequisites, importance and deadline.");
  }
  const assignmentId = typeof value.assignmentId === "string" && value.assignmentId ? value.assignmentId : null;
  if (assignmentId && assignmentId.length > 200) throw new ValidationError("Invalid assignment.");
  return { version: 1, prerequisites: [...new Set(prerequisites)], importance, assignmentId, dueDate };
}

export function readTopicPlanning(raw?: string | null): TopicPlanning {
  try { const value = JSON.parse(raw ?? "null"); return value?.version === 1 ? validateTopicPlanning(value) : DEFAULT_TOPIC_PLANNING; }
  catch { return DEFAULT_TOPIC_PLANNING; }
}

export function topicDeadline(exam: string, planning: TopicPlanning, assignments: { id: string; dueDate: Date; done: boolean }[] = []): string {
  const assignment = assignments.find(item => item.id === planning.assignmentId && !item.done);
  return [exam, planning.dueDate, assignment?.dueDate.toISOString().slice(0, 10)]
    .filter((day): day is string => !!day).sort()[0];
}

/** Reject cycles and cross-course references before changing the saved graph. */
export function validatePrerequisites(topicId: string, planning: TopicPlanning, topics: { id: string; planning: string | null }[]) {
  const graph = new Map(topics.map(topic => [topic.id, readTopicPlanning(topic.planning).prerequisites]));
  graph.set(topicId, planning.prerequisites);
  const visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string) => {
    if (!graph.has(id)) throw new ValidationError("Choose prerequisites from this course.");
    if (visiting.has(id)) throw new ValidationError("Prerequisites cannot form a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of graph.get(id)!) visit(parent);
    visiting.delete(id); visited.add(id);
  };
  visit(topicId);
}

/** Suggestions can reorder known rows only, including repeated original titles. */
export function suggestedTopicOrder(topics: { id: string; title: string }[], suggestions: { title: string; isReview: boolean }[]): string[] {
  const pending = [...topics];
  const ordered: string[] = [];
  for (const suggestion of suggestions) {
    if (suggestion.isReview || typeof suggestion.title !== "string") continue;
    const index = pending.findIndex(topic => topic.title.trim().toLowerCase() === suggestion.title.trim().toLowerCase());
    if (index >= 0) ordered.push(pending.splice(index, 1)[0].id);
  }
  return [...ordered, ...pending.map(topic => topic.id)];
}
