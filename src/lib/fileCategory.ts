/**
 * Auto-classification of uploaded module files into a study-material category.
 *
 * Two independent signals feed the final category:
 *   1. Filename heuristics — fast, free, and surprisingly reliable for the way
 *      German university material is named ("Übungsblatt_3.pdf", "Altklausur
 *      WS2021.pdf", "VL05_Folien.pdf", "Skript.pdf"). See {@link categorizeByFilename}.
 *   2. The AI content analysis — when the upload pipeline asks the model to also
 *      name a category, we accept it (validated) as a fallback / corroboration.
 *
 * Kept as a pure, side-effect-free module so it's unit-testable without a DB or
 * an AI key. The stored value is a plain string (the DB column is nullable TEXT,
 * no DB enum — Postgres-portable); `null` means "unclassified".
 */

export const FILE_CATEGORIES = [
  "uebung",
  "altklausur",
  "slides",
  "skript",
  "mockexam",
  "sonstiges",
] as const;

export type FileCategory = (typeof FILE_CATEGORIES)[number];

/** Type guard: is `v` one of the known category strings? */
export function isFileCategory(v: unknown): v is FileCategory {
  return typeof v === "string" && (FILE_CATEGORIES as readonly string[]).includes(v);
}

/**
 * Ordered keyword → category rules, checked top-to-bottom against the lowercased
 * filename. Order matters: more specific / higher-confidence patterns come first
 * so e.g. "probeklausur"/"mock" win the mock-exam slot before the generic
 * "klausur" rule claims it for altklausur, and "altklausur" outranks "klausur".
 */
const FILENAME_RULES: { needles: string[]; category: FileCategory }[] = [
  // Mock / practice exams the student sits to rehearse (not a real past paper).
  { needles: ["probeklausur", "mockexam", "mock-exam", "mock exam", "testklausur", "mock"], category: "mockexam" },
  // Real past exams.
  { needles: ["altklausur", "altklausuren", "past-exam", "pastexam", "exampaper", "klausur", "exam", "pruefung", "prüfung"], category: "altklausur" },
  // Problem sets / exercise sheets.
  { needles: ["uebung", "übung", "uebungsblatt", "übungsblatt", "exercise", "sheet", "blatt", "problemset", "problem-set", "aufgaben", "hausaufgabe", "homework", "tutorial"], category: "uebung" },
  // Lecture script / full notes. Checked before slides so "LectureNotes" /
  // "lecture-notes" classify as a script, not as bare-"lecture" slides.
  { needles: ["skript", "script", "manuskript", "lecturenotes", "lecture-notes", "lecture notes", "notes", "mitschrift"], category: "skript" },
  // Lecture slides / handouts.
  { needles: ["slides", "folien", "vorlesung", "handout", "lecture", "vl", "präsentation", "praesentation", "deck"], category: "slides" },
];

/**
 * Classify a file purely from its filename. Returns a {@link FileCategory} on a
 * keyword hit, else `null` (caller may fall back to the AI category or leave it
 * unclassified). Matching is substring-on-lowercase, so word boundaries don't
 * matter ("VL05" → slides via "vl"); the rule ORDER resolves overlaps.
 */
export function categorizeByFilename(filename: string): FileCategory | null {
  const name = filename.toLowerCase();
  for (const rule of FILENAME_RULES) {
    if (rule.needles.some((n) => name.includes(n))) return rule.category;
  }
  return null;
}

/**
 * Final category for a stored file: prefer the filename heuristic (high signal
 * for the student's own naming), then the AI-suggested category (validated),
 * else `null` (unclassified). Never throws; junk AI values are ignored.
 */
export function classifyFile(
  filename: string,
  aiCategory?: string | null,
): FileCategory | null {
  return categorizeByFilename(filename) ?? (isFileCategory(aiCategory) ? aiCategory : null);
}
