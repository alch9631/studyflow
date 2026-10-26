import { readStudyResult } from "./studyTask";

/** Attempts and later self-checks describe evidence, never an inferred grade. */
export function summarizeLearning(blocks: { topicId: string; kind: string; studyResult: string | null }[]) {
  const latest = new Map<string, { outcome: string; at: string }>();
  const firstCompleted = new Map<string, number>();
  const laterRecall = new Set<string>();
  const results = blocks.flatMap((block) => {
    const result = readStudyResult(block.studyResult);
    return result?.outcome !== "session" && typeof result?.recordedAt === "string" && Number.isFinite(Date.parse(result.recordedAt)) ? [{ ...block, result }] : [];
  }).sort((a, b) => a.result.recordedAt!.localeCompare(b.result.recordedAt!));
  for (const { topicId, kind, result } of results) {
    const at = Date.parse(result.recordedAt!);
    latest.set(topicId, { outcome: result.outcome, at: result.recordedAt! });
    if (result.outcome === "complete") {
      const first = firstCompleted.get(topicId);
      if (kind === "review" && first !== undefined && at - first >= 86400_000) laterRecall.add(topicId);
      if (first === undefined) firstCompleted.set(topicId, at);
    }
  }
  return { attempts: results.length, goalsMet: [...latest.values()].filter((value) => value.outcome === "complete").length,
    practiceNeeded: [...latest.values()].filter((value) => value.outcome === "practice").length, laterRecall: laterRecall.size };
}
