/**
 * Data-export serializers for the /api/export route.
 *
 * Turns a user's courses + topics + progress into either a clean structured
 * JSON object or a flat, spreadsheet-friendly CSV table (one row per topic, with
 * a synthetic row for courses that have no topics yet, so nothing is dropped).
 *
 * Dependency-light (only `ValidationError` for the format check) so it's easy to
 * unit-test under bare tsx.
 */
import { ValidationError } from "./validate";

/** The two output formats the export route supports. */
export type ExportFormat = "json" | "csv";

/**
 * Validate the `?format=` query value. Defaults to "json" when absent/blank.
 * Throws `ValidationError` (→ 400 via handleApiError) on anything unsupported.
 */
export function parseExportFormat(value: string | null | undefined): ExportFormat {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return "json";
  if (v === "json" || v === "csv") return v;
  throw new ValidationError(`Unsupported export format "${value}". Use "json" or "csv".`);
}

/** Minimal shape the serializers need from a topic. */
export type ExportTopic = {
  id: string;
  title: string;
  effort: number;
  done: boolean;
  order: number;
};

/** Minimal shape the serializers need from a course (with its topics). */
export type ExportCourse = {
  id: string;
  name: string;
  examDate: Date;
  createdAt: Date;
  topics: ExportTopic[];
};

/** A single course in the JSON export, with derived progress. */
export interface ExportCourseJSON {
  id: string;
  name: string;
  examDate: string;
  createdAt: string;
  topicCount: number;
  completedTopics: number;
  progressPercent: number;
  topics: {
    id: string;
    title: string;
    effort: number;
    done: boolean;
    order: number;
  }[];
}

/** The full JSON export envelope. */
export interface ExportJSON {
  exportedAt: string;
  courseCount: number;
  topicCount: number;
  courses: ExportCourseJSON[];
}

/** Percentage of topics marked done (0–100, rounded). 0 when no topics. */
function progressPercent(topics: ExportTopic[]): number {
  if (topics.length === 0) return 0;
  const done = topics.filter((t) => t.done).length;
  return Math.round((done / topics.length) * 100);
}

/**
 * Build the structured JSON export object. `now` is injectable for tests so the
 * `exportedAt` timestamp is deterministic.
 */
export function buildExportJSON(courses: ExportCourse[], now: Date = new Date()): ExportJSON {
  let topicCount = 0;
  const exportedCourses: ExportCourseJSON[] = courses.map((c) => {
    // Topics come back in storage order; export them by their explicit `order`.
    const topics = [...c.topics].sort((a, b) => a.order - b.order);
    topicCount += topics.length;
    return {
      id: c.id,
      name: c.name,
      examDate: c.examDate.toISOString(),
      createdAt: c.createdAt.toISOString(),
      topicCount: topics.length,
      completedTopics: topics.filter((t) => t.done).length,
      progressPercent: progressPercent(topics),
      topics: topics.map((t) => ({
        id: t.id,
        title: t.title,
        effort: t.effort,
        done: t.done,
        order: t.order,
      })),
    };
  });

  return {
    exportedAt: now.toISOString(),
    courseCount: courses.length,
    topicCount,
    courses: exportedCourses,
  };
}

/** Columns of the flat CSV export, in order. */
export const CSV_COLUMNS = [
  "course_id",
  "course_name",
  "exam_date",
  "course_progress_percent",
  "topic_id",
  "topic_title",
  "topic_order",
  "topic_effort",
  "topic_done",
] as const;

/**
 * Escape one value for an RFC-4180 CSV field. Wraps in double quotes (and
 * doubles any embedded quote) when the value contains a comma, quote, CR or LF;
 * otherwise returns it unchanged.
 */
export function csvEscape(value: string | number | boolean): string {
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Join a row of values into a single escaped CSV line. */
function csvRow(values: (string | number | boolean)[]): string {
  return values.map(csvEscape).join(",");
}

/**
 * Build the flat CSV export: a header row plus one row per topic. Courses with
 * no topics still get a row (empty topic columns) so they aren't lost. Uses CRLF
 * line endings per RFC 4180.
 */
export function buildExportCSV(courses: ExportCourse[]): string {
  const rows: string[] = [csvRow([...CSV_COLUMNS])];

  for (const c of courses) {
    const examISO = c.examDate.toISOString().slice(0, 10);
    const pct = progressPercent(c.topics);
    const topics = [...c.topics].sort((a, b) => a.order - b.order);

    if (topics.length === 0) {
      rows.push(csvRow([c.id, c.name, examISO, pct, "", "", "", "", ""]));
      continue;
    }
    for (const t of topics) {
      rows.push(
        csvRow([c.id, c.name, examISO, pct, t.id, t.title, t.order, t.effort, t.done]),
      );
    }
  }

  return rows.join("\r\n");
}
