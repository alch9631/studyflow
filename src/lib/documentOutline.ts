/** Whole-document structure, independent of model input limits and excerpt batches. */
export type DocumentPage = { num: number; text: string };
export type OutlineEntry = {
  id: string; title: string; level: number; parentId: string | null;
  page?: number; line?: number; headingEndLine?: number; printedPage?: number;
};
export type DocumentOutline = { method: "contents" | "headings"; entries: OutlineEntry[] };
export type OutlineUnit = OutlineEntry & { endPage?: number; endLine?: number; reference: string; estimatedMinutes: number; topicId?: string; introductoryPages?: boolean };
export type MaterialOutline = DocumentOutline & { version: 1; id: string; totalPages: number | null; units: OutlineUnit[] };

const clean = (s: string) => s.replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
const key = (s: string) => clean(s).toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const numberPattern = /^(\d{1,3}(?:\.\d{1,3}){0,4})[.)]?\s+(.+)$/;
const contentsTitle = /^(?:contents|table of contents|inhaltsverzeichnis|inhalt|sommaire)\s*$/i;
const validTitle = (s: string) => /^(?:\p{L}|\d+-\p{L})/u.test(s) && s.length <= 200 && !/[=<>∑∫{}·]/u.test(s);

function numbered(line: string): { id: string; title: string } | null {
  const m = clean(line).match(numberPattern);
  return m && Number(m[1].split(".")[0]) > 0 && validTitle(m[2]) ? { id: m[1], title: clean(m[2]) } : null;
}

/** Handles PDF page delimiters emitted by pdf-parse, and ordinary text/Markdown. */
export function documentPages(text: string): DocumentPage[] {
  const parts = text.split(/\n-- (\d+) of \d+ --\s*(?:\n|$)/);
  if (parts.length > 1) {
    const pages: DocumentPage[] = [];
    for (let i = 0; i + 1 < parts.length; i += 2) pages.push({ num: Number(parts[i + 1]), text: parts[i] });
    return pages;
  }
  return text.split("\f").map((text, index) => ({ num: index + 1, text }));
}

/** Read every contents page and body heading; never infer missing chapter names. */
export function detectDocumentOutline(pages: DocumentPage[], pdf = true): DocumentOutline | null {
  const toc = new Map<string, OutlineEntry>();
  const body = new Map<string, OutlineEntry>();
  const bareRoots = new Set<string>();
  const explicitChapters = new Set<string>();
  let globalLine = 0;
  let inContents = false;
  let contentsFinished = false;
  for (const page of pages) {
    const lines = page.text.replace(/\r\n?/g, "\n").split("\n");
    const tocRows = lines.flatMap((line) => {
      const m = clean(line).match(/^(\d{1,3}(?:\.\d{1,3}){0,4})[.)]?\s+(.+?)\s+(\d{1,5})$/);
      if (!m) return [];
      const title = clean(m[2].replace(/(?:\.\s*){2,}/g, " "));
      return validTitle(title) && Number(m[1].split(".")[0]) > 0 && Number(m[3]) > 0 ? [{ id: m[1], title, printedPage: Number(m[3]) }] : [];
    });
    const markedContents = lines.some((line) => contentsTitle.test(clean(line)));
    const dottedContents = lines.filter((line) => /(?:\.\s*){3,}/.test(line)).length >= 3;
    const isContents: boolean = !contentsFinished && tocRows.length > 0 && (markedContents || dottedContents || inContents && tocRows.length >= 3);
    if (inContents && !isContents) contentsFinished = true;
    inContents = isContents;
    if (isContents) {
      for (const row of tocRows) if (!toc.has(row.id)) toc.set(row.id, { ...row, level: row.id.split(".").length, parentId: null });
    }
    for (let index = 0; index < lines.length; index++) {
      globalLine++;
      if (isContents) continue;
      const line = clean(lines[index]);
      let candidate = numbered(line);
      let headingEndLine = globalLine;
      const chapter = line.match(/^(?:chapter|kapitel|chapitre)\s+(\d{1,3})\s*[:.\-–]?\s*(.*)$/i);
      if (chapter) {
        const next = lines.slice(index + 1).find((line) => line.trim());
        const title = clean(chapter[2] || next || "");
        candidate = validTitle(title) ? { id: chapter[1], title } : null;
        if (candidate) explicitChapters.add(candidate.id);
        if (!chapter[2] && next) headingEndLine += lines.slice(index + 1).findIndex((line) => line.trim()) + 1;
      }
      const markdown = line.match(/^(#{1,4})\s+(.+?)\s*#*$/);
      if (markdown) candidate = numbered(markdown[2]) ?? { id: `h-${globalLine}`, title: markdown[2] };
      if (!candidate || !validTitle(candidate.title)) continue;
      // Numbered prose/exercise lists are ambiguous. A contents match, a named
      // chapter, a Markdown heading, or a hierarchical section is stronger evidence.
      if (!chapter && !markdown && !candidate.id.includes(".") && !toc.has(candidate.id)) {
        if (candidate.title.split(" ").length > 15 || /[.;!?]$/.test(candidate.title) || index > 4 && lines[index - 1]?.trim()) continue;
        bareRoots.add(candidate.id);
      }
      const expected = toc.get(candidate.id);
      if (expected && key(expected.title) !== key(candidate.title)) {
        const combined = clean(candidate.title + " " + (lines[index + 1] ?? ""));
        if (key(expected.title) !== key(combined)) continue;
        candidate.title = combined;
      }
      const entry = { ...candidate, level: markdown ? markdown[1].length : candidate.id.split(".").length,
        parentId: null, ...(pdf ? { page: page.num } : { line: globalLine, headingEndLine }) };
      if (!body.has(entry.id)) body.set(entry.id, entry);
    }
  }
  const bareNumbers = [...bareRoots].map(Number).sort((a, b) => a - b);
  const coherentRoots = bareNumbers.length >= 2 && bareNumbers.every((n, i) => i === 0 || n === bareNumbers[i - 1] + 1);
  for (const id of bareRoots) if (!coherentRoots && ![...body.keys()].some((key) => key.startsWith(id + "."))) body.delete(id);
  const method = toc.size >= 2 ? "contents" : "headings";
  const entries = method === "contents" ? [...toc.values(), ...[...body.values()].filter((entry) => !toc.has(entry.id))]
    : [...body.values()];
  if (method === "contents" && entries.length > toc.size) entries.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  if (!entries.length || entries.length === 1 && !explicitChapters.has(entries[0].id)) return null;
  // Match printed page numbers to physical PDF pages only with corroborating anchors.
  const offsets = entries.flatMap((e) => e.printedPage && body.get(e.id)?.page ? [body.get(e.id)!.page! - e.printedPage] : []);
  const offset = offsets.length >= 2 && offsets.every((n) => n === offsets[0]) ? offsets[0] : null;
  const stack: OutlineEntry[] = [];
  for (const e of entries) {
    const location = body.get(e.id);
    if (location?.page) e.page = location.page;
    else if (pdf && offset !== null && e.printedPage && e.printedPage + offset > 0 && e.printedPage + offset <= pages.length) e.page = e.printedPage + offset;
    if (location?.line) e.line = location.line;
    if (location?.headingEndLine) e.headingEndLine = location.headingEndLine;
    while (stack.length && stack.at(-1)!.level >= e.level) stack.pop();
    e.parentId = stack.at(-1)?.id ?? null;
    stack.push(e);
  }
  return { method, entries };
}

/** Chapters group the preview; their immediate sections become non-overlapping plan units. */
export function outlineUnits(outline: DocumentOutline, totalPages: number | null, totalLines: number): OutlineUnit[] {
  const roots = outline.entries.filter((e) => !e.parentId);
  const chosen = roots.flatMap((root) => {
    const children = outline.entries.filter((e) => e.parentId === root.id);
    // Introductory pages before a subsection get their own unit; the full
    // chapter is never scheduled alongside all its sections.
    if (!children.length) return [root];
    const hasIntroduction = root.page && children[0].page && root.page < children[0].page
      || root.line && children[0].line && (root.headingEndLine ?? root.line) + 1 < children[0].line;
    return hasIntroduction ? [root, ...children] : children;
  });
  return chosen.map((entry, index) => {
    const next = chosen[index + 1];
    const endPage = entry.page ? Math.max(entry.page, next?.page ? next.page - 1 : next ? entry.page : totalPages ?? entry.page) : undefined;
    const endLine = entry.line ? Math.max(entry.line, next?.line ? next.line - 1 : next ? entry.line : totalLines) : undefined;
    const reference = entry.page ? `PDF p. ${entry.page}${endPage !== entry.page ? `–${endPage}` : ""}`
      : entry.line ? `Lines ${entry.line}–${endLine}` : entry.printedPage ? `Printed p. ${entry.printedPage}` : `${entry.id} ${entry.title}`;
    const introductoryPages = roots.some((root) => root.id === entry.id) && outline.entries.some((child) => child.parentId === entry.id);
    return { ...entry, endPage, endLine, reference, ...(introductoryPages ? { introductoryPages: true } : {}),
      estimatedMinutes: Math.min(600, Math.max(30, Math.ceil(((endPage ?? 0) - (entry.page ?? 0) + 1) * 20 / 15) * 15)) };
  });
}

export function outlineTopicTitle(unit: OutlineUnit): string {
  return `${unit.id.startsWith("h-") ? "" : unit.id + " "}${unit.title}${unit.introductoryPages ? ` (${unit.reference})` : ""}`;
}

export function readMaterialOutline(raw: string | null | undefined): MaterialOutline | null {
  try {
    const value = JSON.parse(raw ?? "null")?.outline;
    if (value?.version !== 1 || typeof value.id !== "string" || !["contents", "headings"].includes(value.method) || !Array.isArray(value.entries) || !Array.isArray(value.units) || value.entries.length > 2000 || value.units.length > 500) return null;
    if (![...value.entries, ...value.units].every((e: OutlineEntry) => e && typeof e.id === "string" && typeof e.title === "string" && e.title.length <= 200 && Number.isInteger(e.level) && e.level > 0 && e.level <= 5 &&
      (e.page === undefined || Number.isInteger(e.page) && e.page > 0) && (e.line === undefined || Number.isInteger(e.line) && e.line > 0))) return null;
    if (!value.units.every((u: OutlineUnit) => typeof u.reference === "string" && u.reference.length <= 300 && Number.isInteger(u.estimatedMinutes) && u.estimatedMinutes >= 30 && u.estimatedMinutes <= 600 && (u.topicId === undefined || typeof u.topicId === "string"))) return null;
    return value;
  } catch { return null; }
}

/** A small model request retains headings from the entire document, even on retries. */
export function structureAwareInput(text: string, cap: number): string {
  if (text.length <= cap) return text;
  const outline = detectDocumentOutline(documentPages(text), false);
  const headings = outline?.entries.map((e) => `${e.id} ${e.title}`).join("\n") ?? "";
  if (!headings) {
    const marker = "\n[Middle omitted; document ending follows]\n";
    const half = Math.max(0, Math.floor((cap - marker.length) / 2));
    const tail = Math.max(0, cap - half - marker.length);
    return `${text.slice(0, half)}${marker}${tail ? text.slice(-tail) : ""}`.slice(0, cap);
  }
  const headingBudget = Math.min(headings.length, Math.floor(cap * 0.8));
  // Sample headings evenly if a very small provider budget cannot hold all of them.
  const rows = headings.split("\n");
  let selected = rows;
  while (selected.join("\n").length > headingBudget && selected.length > 2) selected = selected.filter((_, i) => i % 2 === 0 || i === selected.length - 1);
  const prefix = `Document headings (whole document, original order):\n${selected.join("\n")}\n\nSource excerpt:\n`;
  return (prefix + text.slice(0, Math.max(0, cap - prefix.length))).slice(0, cap);
}
