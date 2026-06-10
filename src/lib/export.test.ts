/**
 * Tests for the data-export serializers. Run: npx tsx src/lib/export.test.ts
 */
import {
  parseExportFormat,
  buildExportJSON,
  buildExportCSV,
  csvEscape,
  CSV_COLUMNS,
  type ExportCourse,
} from "./export";
import { ValidationError } from "./validate";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}
/** True if `fn` throws a ValidationError. */
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof ValidationError;
  }
}

const course = (over: Partial<ExportCourse> = {}): ExportCourse => ({
  id: "c1",
  name: "Algorithms",
  examDate: new Date("2026-07-01T00:00:00Z"),
  createdAt: new Date("2026-06-01T00:00:00Z"),
  topics: [
    { id: "t1", title: "Graphs", effort: 1, done: true, order: 0 },
    { id: "t2", title: "Sorting", effort: 2, done: false, order: 1 },
  ],
  ...over,
});

// --- parseExportFormat ---
check("defaults to json when absent", parseExportFormat(null) === "json");
check("defaults to json when blank", parseExportFormat("  ") === "json");
check("accepts json", parseExportFormat("json") === "json");
check("accepts csv", parseExportFormat("csv") === "csv");
check("case-insensitive", parseExportFormat("CSV") === "csv");
check("rejects unknown format", throws(() => parseExportFormat("xml")));

// --- csvEscape ---
check("plain value unchanged", csvEscape("Graphs") === "Graphs");
check("number stringified", csvEscape(42) === "42");
check("boolean stringified", csvEscape(true) === "true");
check("wraps value with comma", csvEscape("A, B") === '"A, B"');
check("doubles embedded quotes", csvEscape('say "hi"') === '"say ""hi"""');
check("wraps value with newline", csvEscape("line1\nline2") === '"line1\nline2"');
check("wraps value with CR", csvEscape("a\rb") === '"a\rb"');

// --- buildExportJSON ---
const json = buildExportJSON([course()], new Date("2026-06-08T12:00:00Z"));
check("deterministic exportedAt", json.exportedAt === "2026-06-08T12:00:00.000Z");
check("courseCount", json.courseCount === 1);
check("topicCount totals across courses", json.topicCount === 2);
check("course examDate is ISO", json.courses[0].examDate === "2026-07-01T00:00:00.000Z");
check("completedTopics counts done", json.courses[0].completedTopics === 1);
check("progressPercent rounds (1/2 → 50)", json.courses[0].progressPercent === 50);
check("topics included in order", json.courses[0].topics.map((t) => t.id).join(",") === "t1,t2");

const empty = buildExportJSON([], new Date("2026-06-08T12:00:00Z"));
check("empty export has zero counts", empty.courseCount === 0 && empty.topicCount === 0);

const noTopics = buildExportJSON([course({ topics: [] })]);
check("no-topic course → 0% progress", noTopics.courses[0].progressPercent === 0);

// --- buildExportCSV ---
const csv = buildExportCSV([course()]);
const lines = csv.split("\r\n");
check("CSV uses CRLF line endings", csv.includes("\r\n"));
check("header is the column list", lines[0] === CSV_COLUMNS.join(","));
check("one data row per topic", lines.length === 3); // header + 2 topics
check("row carries course + topic fields", lines[1] === "c1,Algorithms,2026-07-01,50,t1,Graphs,0,1,true");
check("done flag serialized", lines[2].endsWith(",false"));

// course with no topics still gets a row (not dropped)
const csvNoTopics = buildExportCSV([course({ topics: [] })]);
const noTopicLines = csvNoTopics.split("\r\n");
check("no-topic course still emits a row", noTopicLines.length === 2);
check("no-topic row has empty topic columns", noTopicLines[1] === "c1,Algorithms,2026-07-01,0,,,,,");

// escaping inside a real row (course name with a comma)
const csvComma = buildExportCSV([
  course({ name: "Math, Advanced", topics: [{ id: "t9", title: 'A "B"', effort: 1, done: false, order: 0 }] }),
]);
check("CSV escapes comma in course name", csvComma.includes('"Math, Advanced"'));
check("CSV escapes quotes in topic title", csvComma.includes('"A ""B"""'));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
