import { quickStudyTask, validateStudyTask, type StudyTask } from "./studyTask";

export type StudySection = { id: string; reference: string; text: string; nextLine?: number };
export type StudyDraft = { id: string; title: string; task: StudyTask; topicId?: string };
export type StudyDraftSet = { version: 1; id: string; method: "ai" | "excerpts"; items: StudyDraft[]; cursor?: number; nextCursor?: number | null };

/** Bound the work to reviewable excerpts, retaining actual line/page locations. */
export function textStudySections(text: string, page?: number, startLine = 1): StudySection[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const sections: StudySection[] = [];
  let start = Math.max(0, startLine - 1);
  while (start < lines.length && sections.length < 6) {
    let end = start; let excerpt = "";
    while (end < lines.length && end - start < 35 && excerpt.length + lines[end].length < 5000) {
      if (end > start && /^\s*(?:#{1,4}\s*)?(?:(?:exercise|aufgabe|problem|question)\s+\d|\d{1,2}[.)]\s+\S)/i.test(lines[end])) break;
      excerpt += lines[end++] + "\n";
    }
    if (end === start) { excerpt = lines[start].slice(0, 5000); end++; }
    if (excerpt.trim()) sections.push({ id: `${page ? `p${page}` : "text"}-${start + 1}`,
      reference: page ? `PDF p. ${page} · ${sections.length + 1}` : `Lines ${start + 1}–${end}`, text: excerpt.trim(), nextLine: end + 1 });
    start = end;
  }
  return sections;
}

export function excerptStudyDrafts(sections: StudySection[], fileId: string, language: "en" | "de"): StudyDraft[] {
  return sections.slice(0, 6).map((section) => {
    const mode = /(?:\bexercise\b|\baufgabe\b|\bproblem\s+\d)/i.test(section.text) ? "solve" : "read";
    return { id: section.id, title: section.text.split("\n").find((line) => line.trim())!.trim().slice(0, 150),
      task: quickStudyTask(mode, 30, language, { sourceFileId: fileId, sourceRef: section.reference, sourceExcerpt: section.text }) };
  });
}

/** Models choose existing section IDs; they cannot invent pages or source text. */
export function groundedStudyDrafts(raw: unknown, sections: StudySection[], fileId: string): StudyDraft[] {
  const values = (raw as { items?: unknown })?.items;
  if (!Array.isArray(values)) return [];
  const byId = new Map(sections.map((section) => [section.id, section]));
  return values.slice(0, 8).flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const p = item as Record<string, unknown>;
    const section = byId.get(String(p.sectionId));
    if (!section || typeof p.title !== "string" || !p.title.trim()) return [];
    if (!Number.isInteger(p.estimatedMinutes) || Number(p.estimatedMinutes) < 5 || Number(p.estimatedMinutes) > 45) return [];
    const quote = typeof p.answerQuote === "string" ? p.answerQuote.trim() : "";
    const hasAnswer = quote.length > 0 && section.text.includes(quote) && typeof p.checkQuestion === "string" && p.checkQuestion.trim();
    try {
      return [{ id: `${section.id}-${index}`, title: p.title.trim().slice(0, 200), task: validateStudyTask({
        instruction: p.instruction, successCriteria: p.successCriteria, estimatedMinutes: p.estimatedMinutes,
        sourceFileId: fileId, sourceRef: section.reference, sourceExcerpt: section.text,
        checkQuestion: hasAnswer ? p.checkQuestion : "", answerKey: hasAnswer ? quote : "",
      }) }];
    } catch { return []; }
  });
}

export function readStudyDrafts(raw: string | null | undefined): StudyDraftSet | null {
  try {
    const value = JSON.parse(raw ?? "null");
    if (value?.version !== 1 || typeof value.id !== "string" || !["ai", "excerpts"].includes(value.method) || !Array.isArray(value.items) || value.items.length > 8) return null;
    if (!value.items.every((item: StudyDraft) => item && typeof item.id === "string" && typeof item.title === "string" && (!item.topicId || typeof item.topicId === "string"))) return null;
    if (value.nextCursor != null && (!Number.isInteger(value.nextCursor) || value.nextCursor < 1 || value.nextCursor > 100000)) return null;
    return { ...value, items: value.items.map((item: StudyDraft) => ({ ...item, task: validateStudyTask(item.task as unknown as Record<string, unknown>) })) };
  } catch { return null; }
}
