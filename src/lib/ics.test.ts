/**
 * Tests for the .ics calendar builder. Run: npx tsx src/lib/ics.test.ts
 */
import { buildCalendar, type CalendarBlock } from "./ics";

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

const block = (over: Partial<CalendarBlock> = {}): CalendarBlock => ({
  date: new Date("2026-06-08T00:00:00Z"),
  minutes: 30,
  topicTitle: "Graphs",
  kind: "study",
  course: { name: "Algorithms" },
  ...over,
});

const empty = buildCalendar([]);
check("empty wraps in VCALENDAR", empty.startsWith("BEGIN:VCALENDAR") && empty.includes("END:VCALENDAR"));
check("empty has no events", !empty.includes("BEGIN:VEVENT"));

const one = buildCalendar([block()]);
check("one block → one event", (one.match(/BEGIN:VEVENT/g) || []).length === 1);
check("study summary has topic + course", one.includes("📚 Graphs (Algorithms)"));
check("starts at 09:00", one.includes("DTSTART:20260608T090000"));
check("uses CRLF line endings", one.includes("\r\n"));

const review = buildCalendar([block({ kind: "review", topicTitle: "Sorting" })]);
check("review summary prefixed", review.includes("🔁 Review: Sorting"));

// escaping (commas/semicolons in names)
const esc = buildCalendar([block({ course: { name: "A, B; C" } })]);
check("escapes comma + semicolon", esc.includes("A\\, B\\; C"));

// two blocks same day lay back-to-back
const two = buildCalendar([block(), block({ topicTitle: "DP" })]);
check("two same-day events", (two.match(/BEGIN:VEVENT/g) || []).length === 2);
check("second starts where first ends", two.includes("DTSTART:20260608T093000"));

// ── helpers for the structural / folding assertions ──────────────────────────
const enc = new TextEncoder();
const octets = (s: string) => enc.encode(s).length;
const physical = (cal: string) => cal.split("\r\n"); // wire lines, incl. fold continuations
const unfold = (cal: string) => cal.replace(/\r\n /g, ""); // RFC 5545 §3.1 reverse-fold
const summaryOf = (cal: string) =>
  unfold(cal)
    .split("\r\n")
    .find((l) => l.startsWith("SUMMARY:")) ?? "";

// ── extra escaping: backslash, newlines, CR, combined, unicode ───────────────
const bsl = buildCalendar([block({ course: { name: "C:\\path" } })]);
check("backslash is doubled", summaryOf(bsl).includes("C:\\\\path"));

const nl = buildCalendar([block({ topicTitle: "line1\nline2" })]);
check("LF escaped to literal \\n", summaryOf(nl).includes("line1\\nline2"));
check("no raw LF survives inside a value", !nl.split("END:VCALENDAR")[0].includes("line1\nline2"));

// A bare CR / CRLF inside a value must not inject a phantom content line.
const crlf = buildCalendar([block({ topicTitle: "a\r\nb", course: { name: "c\rd" } })]);
check("CRLF collapses to a single \\n", summaryOf(crlf).includes("a\\nb"));
check("lone CR escaped, not passed through", summaryOf(crlf).includes("c\\nd"));
check(
  "value carries no stray CR/LF (only the structural CRLF folds remain)",
  crlf.split("\r\n").every((l) => !l.includes("\n") && !l.includes("\r")),
);

const combo = buildCalendar([block({ topicTitle: "a,b;c\\d\ne" })]);
check("combined specials all escaped", summaryOf(combo).includes("a\\,b\\;c\\\\d\\ne"));

const uni = buildCalendar([block({ topicTitle: "数学 Müller ✅", course: { name: "Étude" } })]);
check("unicode preserved verbatim", summaryOf(uni).includes("数学 Müller ✅ (Étude)"));
check("no replacement char introduced", !uni.includes("�"));

// ── valid VCALENDAR structure ────────────────────────────────────────────────
const struct = buildCalendar([block(), block({ kind: "review", topicTitle: "DP" })]);
const sLines = physical(struct);
check("VERSION present", sLines.includes("VERSION:2.0"));
check("PRODID present", sLines.some((l) => l.startsWith("PRODID:")));
check("CALSCALE present", sLines.includes("CALSCALE:GREGORIAN"));
check("first line is BEGIN:VCALENDAR", sLines[0] === "BEGIN:VCALENDAR");
check("last line is END:VCALENDAR", sLines[sLines.length - 1] === "END:VCALENDAR");
check(
  "BEGIN/END VEVENT counts match event count",
  (struct.match(/BEGIN:VEVENT/g) || []).length === 2 &&
    (struct.match(/END:VEVENT/g) || []).length === 2,
);
for (const prop of ["UID:", "DTSTAMP:", "DTSTART:", "DTEND:", "SUMMARY:"]) {
  check(`every event has ${prop}`, (struct.match(new RegExp(prop, "g")) || []).length === 2);
}

// ── DTSTAMP (UTC) vs DTSTART/DTEND (floating local) ──────────────────────────
check("DTSTAMP is UTC-stamped (trailing Z)", /DTSTAMP:\d{8}T\d{6}Z/.test(struct));
check("DTSTART is floating (no trailing Z)", /DTSTART:\d{8}T\d{6}(?!Z)/.test(struct) && !/DTSTART:\d{8}T\d{6}Z/.test(struct));
check("DTEND is floating (no trailing Z)", !/DTEND:\d{8}T\d{6}Z/.test(struct));
check("all events are timed, never all-day (no VALUE=DATE)", !struct.includes("VALUE=DATE"));

// ── determinism: identical input → byte-identical output (stable UID/DTSTAMP) ─
const blocksA = [block(), block({ topicTitle: "DP" }), block({ kind: "review", topicTitle: "Greedy" })];
const blocksB = [block(), block({ topicTitle: "DP" }), block({ kind: "review", topicTitle: "Greedy" })];
check("output is deterministic across calls", buildCalendar(blocksA) === buildCalendar(blocksB));
check("UIDs are unique within a calendar", (() => {
  const uids = (buildCalendar(blocksA).match(/UID:[^\r\n]+/g) || []);
  return new Set(uids).size === uids.length && uids.length === 3;
})());

// ── multi-day grouping: each day's first session starts at 09:00 ─────────────
const multiDay = buildCalendar([
  block({ date: new Date("2026-06-08T00:00:00Z"), topicTitle: "A" }),
  block({ date: new Date("2026-06-10T00:00:00Z"), topicTitle: "B" }),
]);
check("day 1 starts 09:00", multiDay.includes("DTSTART:20260608T090000"));
check("day 2 also starts 09:00", multiDay.includes("DTSTART:20260610T090000"));
check("per-day UID carries that day's date", multiDay.includes("@studyflow") && /UID:sf-\d+-20260610@studyflow/.test(multiDay));

// ── duration clamps to 23:59, never spilling into the next day ───────────────
const huge = buildCalendar([block({ minutes: 10_000 })]); // ~7 days of minutes
check("end time clamps at 23:59", huge.includes("DTEND:20260608T235900"));

// ── line folding (RFC 5545 §3.1): ≤75 octets per wire line ───────────────────
const longName =
  "Advanced Theoretical Foundations of Distributed Consensus and Concurrent Programming Systems";
const folded = buildCalendar([block({ topicTitle: longName, course: { name: longName } })]);
check("every wire line is ≤75 octets", physical(folded).every((l) => octets(l) <= 75));
check("folding actually occurred (a continuation line exists)", physical(folded).some((l) => l.startsWith(" ")));
check(
  "unfolding restores the full SUMMARY value",
  summaryOf(folded).includes(`📚 ${longName} (${longName})`),
);

// fold must never split a multi-octet UTF-8 sequence → exact round-trip
const emoji = "📚".repeat(40);
const foldedUni = buildCalendar([block({ topicTitle: emoji, course: { name: "Algo" } })]);
check("multibyte fold is octet-safe (no replacement char)", !foldedUni.includes("�"));
check("multibyte SUMMARY round-trips exactly", summaryOf(foldedUni) === `SUMMARY:📚 ${emoji} (Algo)`);
check("emoji calendar wire lines still ≤75 octets", physical(foldedUni).every((l) => octets(l) <= 75));

// fold boundary is exactly at 75 octets
const exact = "a".repeat(58); // makes `SUMMARY:📚 <58a> (X)` exactly 75 octets
const at75 = buildCalendar([block({ topicTitle: exact, course: { name: "X" } })]);
check("a 75-octet line is NOT folded", at75.includes(`SUMMARY:📚 ${exact} (X)`) && physical(at75).every((l) => octets(l) <= 75));
const over = "a".repeat(59); // one octet over → must fold
const at76 = buildCalendar([block({ topicTitle: over, course: { name: "X" } })]);
check("a 76-octet line IS folded", !at76.includes(`SUMMARY:📚 ${over} (X)`));
check("but unfolds back to the original 76-octet line", unfold(at76).includes(`SUMMARY:📚 ${over} (X)`));

// ── large event set stays well-formed and bounded ────────────────────────────
const many: CalendarBlock[] = [];
for (let i = 0; i < 600; i++) {
  const day = String(1 + (i % 28)).padStart(2, "0");
  many.push(block({ date: new Date(`2026-06-${day}T00:00:00Z`), topicTitle: `Topic ${i}`, minutes: 20 }));
}
const big = buildCalendar(many);
check("large set emits one event per block", (big.match(/BEGIN:VEVENT/g) || []).length === 600);
check("large set BEGIN/END VEVENT balanced", (big.match(/END:VEVENT/g) || []).length === 600);
check("large set still wrapped in VCALENDAR", big.startsWith("BEGIN:VCALENDAR\r\n") && big.endsWith("\r\nEND:VCALENDAR"));
check("large set: all UIDs unique", (() => {
  const uids = big.match(/UID:[^\r\n]+/g) || [];
  return new Set(uids).size === 600;
})());
check("large set: every wire line ≤75 octets", physical(big).every((l) => octets(l) <= 75));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
