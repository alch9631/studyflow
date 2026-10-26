import { createHash } from "node:crypto";
import { isValidISODate, maxFutureISO } from "./validate";
import { TUHH_EXAM_URL, type ExamSchedule, type PublishedExam } from "./examSyncTypes";

const MAX_SOURCE_BYTES = 2_000_000;
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

/** Only text is retained. Upstream markup is never rendered in StudyFlow. */
function textContent(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (!name.startsWith("#")) return ENTITIES[name] ?? entity;
    const point = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
      ? String.fromCodePoint(point) : "";
  }).replace(/\s+/g, " ").trim();
}

export function normalizeExamName(name: string): string {
  return name.toLowerCase().replace(/\((?:teil)?modul\)/g, " ")
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}+]+/gu, " ").trim();
}

/** Parse TUHH's titleline / dataline / commentline table, failing closed on a changed page. */
export function parseTuhhExamSchedule(html: string, checkedAt = new Date().toISOString()): ExamSchedule {
  if (Buffer.byteLength(html, "utf8") > MAX_SOURCE_BYTES) throw new Error("TUHH exam page too large");
  const headings = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2\s*>/gi)].map((m) => textContent(m[1]));
  const semester = headings.map((h) => /^Prüfungszeitraum:\s*((?:Winter|Sommer)semester \d{4}(?:\/\d{2,4})?)$/u.exec(h)?.[1]).find(Boolean);
  if (!semester) throw new Error("TUHH exam semester not found");

  const pending: Omit<PublishedExam, "key" | "individualAppointment">[] = [];
  let title = "";
  let names: string[] = [];
  let last: (typeof pending)[number] | undefined;
  let titleRows = 0;
  for (const row of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr\s*>/gi)) {
    const classes = /\bclass\s*=\s*["']([^"']*)["']/i.exec(row[1])?.[1].split(/\s+/) ?? [];
    const cells = [...row[2].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map((m) => textContent(m[1]));
    if (classes.includes("titleline")) {
      titleRows++;
      title = cells[0] ?? "";
      // Bold module names and slash-separated lecture names are explicit aliases.
      const bold = [...row[2].matchAll(/<strong\b[^>]*>([\s\S]*?)<\/strong\s*>/gi)].map((m) => textContent(m[1]));
      names = [...new Set([title, ...bold, ...title.split(/\s*\/\s*/)].map(normalizeExamName).filter((n) => n.length >= 4))];
      last = undefined;
    } else if (classes.includes("dataline")) {
      if (!title || cells.length !== 4) throw new Error("TUHH exam row format changed");
      const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cells[0]);
      const iso = match ? `${match[3]}-${match[2]}-${match[1]}` : "";
      if (match && !isValidISODate(iso)) throw new Error("TUHH published an invalid date");
      last = {
        title, names, date: iso || null, time: cells[1], location: cells[2], note: "",
      };
      pending.push(last);
    } else if (classes.includes("commentline") && last) {
      last.note = cells.join(" ");
    }
  }
  if (!titleRows || !pending.length) throw new Error("TUHH exam table not found");
  const exams = pending.map((exam) => {
    const individualAppointment = /\b(?:vom|von)\b.*\bbis\b|\d{1,2}\.\d{1,2}\.\s*[-–]\s*\d{1,2}\.\d{1,2}\.|individuell.*(?:termin|datum)/iu.test(exam.note);
    const key = createHash("sha256").update(JSON.stringify({ ...exam, individualAppointment })).digest("hex");
    return { ...exam, individualAppointment, key };
  });
  return { semester, checkedAt, exams: [...new Map(exams.map((exam) => [exam.key, exam])).values()] };
}

export function isSyncableExam(exam: PublishedExam, today: string): boolean {
  return !!exam.date && exam.date >= today && exam.date <= maxFutureISO(today)
    && !exam.individualAppointment && !/keine prüfungsanmeldungen|no exam registrations/iu.test(`${exam.location} ${exam.note}`);
}

/** A fixed public source: no supplied URL, credentials, redirects, or unbounded response bodies. */
export async function fetchTuhhExamSchedule(): Promise<ExamSchedule> {
  const response = await fetch(TUHH_EXAM_URL, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { Accept: "text/html" },
  });
  if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !response.body) {
    throw new Error(`TUHH exam page unavailable (${response.status})`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) throw new Error("TUHH exam page too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return parseTuhhExamSchedule(Buffer.concat(chunks).toString("utf8"));
}
