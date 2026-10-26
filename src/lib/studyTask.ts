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
  sourceExcerpt?: string;
};

export function readStudyResult(raw: string | null | undefined): { outcome: "complete" | "practice" | "session"; planUpdated?: boolean; response?: string; recordedAt?: string } | null {
  if (!raw) return null;
  try {
    const result = JSON.parse(raw);
    return result?.version === 1 && ["complete", "practice", "session"].includes(result.outcome) ? result : null;
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
    sourceExcerpt: text(input.sourceExcerpt, 6000),
  };
}

export type StudyProgress = { version: 1; response: string; elapsedSeconds: number; updatedAt: string; sessionMinutes?: number };
export function readStudyProgress(raw: string | null | undefined): StudyProgress | null {
  try {
    const p = JSON.parse(raw ?? "null");
    const valid = p?.version === 1 && typeof p.response === "string" && p.response.length <= 4000 &&
      Number.isInteger(p.elapsedSeconds) && p.elapsedSeconds >= 0 && p.elapsedSeconds <= 36000 && typeof p.updatedAt === "string" &&
      Number.isFinite(Date.parse(p.updatedAt)) && (p.sessionMinutes === undefined || Number.isInteger(p.sessionMinutes) && p.sessionMinutes >= 5 && p.sessionMinutes <= 600);
    return valid ? { version: 1, response: p.response, elapsedSeconds: p.elapsedSeconds, updatedAt: new Date(p.updatedAt).toISOString(),
      ...(p.sessionMinutes === undefined ? {} : { sessionMinutes: p.sessionMinutes }) } : null;
  } catch { return null; }
}

export type StudyMode = "read" | "solve" | "recall";
export function quickStudyTask(mode: StudyMode, minutes: number, language: "de" | "en", source: {
  sourceFileId?: string; sourceRef?: string; sourceExcerpt?: string;
}): StudyTask {
  if (!["read", "solve", "recall"].includes(mode) || ![15, 30, 45].includes(minutes)) throw new ValidationError("Choose a study activity and duration.");
  const de = language === "de";
  const templates = {
    read: [de ? "Lies den ausgewählten Abschnitt. Schließe das Material und erkläre die drei wichtigsten Ideen aus dem Gedächtnis." : "Read the selected section. Close the material and explain its three main ideas from memory.",
      de ? "Ich kann die drei Ideen ohne Nachlesen erklären und habe sie mit der Quelle verglichen." : "I can explain the three ideas without looking and have checked them against the source."],
    solve: [de ? "Bearbeite die Aufgaben im ausgewählten Abschnitt. Notiere deinen Lösungsweg und prüfe ihn anhand der Lösung oder Quelle." : "Work through the exercises in the selected section. Write your steps and compare them with the solution or source.",
      de ? "Ich habe die Aufgaben gelöst und meinen Lösungsweg geprüft. Offene Fragen sind notiert." : "I have solved the exercises and checked my steps. I have noted any unresolved questions."],
    recall: [de ? "Schließe das Material. Schreibe auf, was du über den ausgewählten Abschnitt weißt. Öffne ihn danach und korrigiere deine Lücken." : "Close the material. Recall what you know about the selected section, then reopen it and correct the gaps.",
      de ? "Ich habe mein Wissen ohne Hilfe abgerufen und mit der Quelle verglichen." : "I have recalled the material without help and checked the gaps against the source."],
  };
  return validateStudyTask({ ...source, instruction: templates[mode][0], successCriteria: templates[mode][1], estimatedMinutes: minutes });
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
  if (task.sourceFileId && fileAvailable) {
    const page = /^PDF p\. (\d+)/.exec(task.sourceRef)?.[1];
    return `/api/materials/${encodeURIComponent(task.sourceFileId)}${page ? `#page=${page}` : ""}`;
  }
  return task.sourceUrl;
}
