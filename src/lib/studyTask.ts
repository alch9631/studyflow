import { ValidationError } from "./validate";

export type StudyTask = {
  version: 1;
  instruction: string;
  successCriteria: string;
  estimatedMinutes: number;
  sourceFileId: string | null;
  sourceUrl: string | null;
  sourceRef: string;
  checkQuestion: string;
  answerKey: string;
};

export function readStudyResult(raw: string | null | undefined): { outcome: "complete" | "practice"; planUpdated?: boolean } | null {
  if (!raw) return null;
  try {
    const result = JSON.parse(raw);
    return result?.version === 1 && ["complete", "practice"].includes(result.outcome) ? result : null;
  } catch { return null; }
}

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const result = value.trim();
  if (result.length > max) throw new ValidationError("This field is too long.");
  return result;
}

/** Only web links are navigable. Never accept javascript:, data:, or relative URLs. */
export function studySourceUrl(value: unknown): string | null {
  const raw = text(value, 2000);
  if (!raw) return null;
  let url: URL;
  try { url = new URL(raw); } catch { throw new ValidationError("Use a complete https:// or http:// source link."); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new ValidationError("Use a complete https:// or http:// source link.");
  }
  return url.href;
}

export function validateStudyTask(input: Record<string, unknown>): StudyTask {
  const instruction = text(input.instruction, 2000);
  const successCriteria = text(input.successCriteria, 2000);
  const estimatedMinutes = Number(input.estimatedMinutes);
  const checkQuestion = text(input.checkQuestion, 2000);
  const answerKey = text(input.answerKey, 4000);
  if (!instruction || !successCriteria) throw new ValidationError("Describe the work and what counts as finished.");
  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 600) {
    throw new ValidationError("Estimate between 5 and 600 minutes.");
  }
  if (!!checkQuestion !== !!answerKey) throw new ValidationError("Add both the check question and its answer key.");
  return {
    version: 1, instruction, successCriteria, estimatedMinutes,
    sourceFileId: text(input.sourceFileId, 200) || null,
    sourceUrl: studySourceUrl(input.sourceUrl),
    sourceRef: text(input.sourceRef, 300), checkQuestion, answerKey,
  };
}

/** Old topics remain valid; malformed task metadata is treated as unconfigured. */
export function readStudyTask(raw: string | null | undefined): StudyTask | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data?.version === 1 ? validateStudyTask(data) : null;
  } catch { return null; }
}

export function taskSourceHref(task: StudyTask, fileAvailable: boolean): string | null {
  if (task.sourceFileId && fileAvailable) return `/api/materials/${encodeURIComponent(task.sourceFileId)}`;
  return task.sourceUrl;
}
