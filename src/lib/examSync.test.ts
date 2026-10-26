import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { applyExamDateChanges, buildExamSyncPreview, ExamSyncConflict, parseExamDateChanges } from "./examSync";
import { fetchTuhhExamSchedule, isSyncableExam, normalizeExamName, parseTuhhExamSchedule } from "./tuhhExams";
import { todayISO } from "./planService";
import { TUHH_EXAM_URL, type ExamDateChange } from "./examSyncTypes";

const today = todayISO();
const future = (days: number) => {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const german = (date: string) => date.split("-").reverse().join(".");
const row = (name: string, date: string, note = "", location = "Halle &amp; Labor") => `
  <tr class='titleline'><td colspan='4'><strong>${name}</strong></td></tr>
  <tr class='dataline'><td>${date}</td><td>09:00</td><td>${location}</td><td>Prüfer</td></tr>
  <tr class='commentline'><td colspan='4'><em>${note}</em></td></tr>`;
const page = (rows: string) => `<h2>Prüfungszeitraum: Wintersemester 2026/27</h2><table>${rows}</table>`;
const html = page(
  row("Algorithmen und Datenstrukturen (Modul)", german(future(30)))
  + row("Mathematik III (Modul)", german(future(40)))
  + row("Mathematik I (Modul)", german(future(30)), "E-Prüfungen vom 15.02. bis 19.02.2027, Aufteilung durch die Prüfer!")
  + row("Seminar", "nach Vereinbarung")
  + row("Alte Prüfung", german(future(-1)))
  + row("Keine Anmeldung", german(future(30)), "", "Keine Prüfungsanmeldungen")
);
const schedule = parseTuhhExamSchedule(html);
const sourceExam = schedule.exams[0];
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`✓ ${name}`); }

async function main() {
  check("parses semester, fixed dates, time, and decoded location", () => {
    assert.equal(schedule.semester, "Wintersemester 2026/27");
    assert.equal(sourceExam.date, future(30));
    assert.equal(sourceExam.time, "09:00");
    assert.equal(sourceExam.location, "Halle & Labor");
  });
  check("source keys are stable and detect changed dates", () => {
    assert.equal(sourceExam.key, parseTuhhExamSchedule(html).exams[0].key);
    assert.notEqual(sourceExam.key, parseTuhhExamSchedule(html.replace(german(future(30)), german(future(31)))).exams[0].key);
  });
  check("handles entities and explicit aliases without mixing language variants", () => {
    const exam = parseTuhhExamSchedule(page(row("K&ouml;rper &amp; Str&#246;mung (Modul)/Vorlesung A", german(future(30))))).exams[0];
    assert.equal(exam.title, "Körper & Strömung (Modul)/Vorlesung A");
    assert.ok(exam.names.includes("vorlesung a"));
    assert.equal(normalizeExamName("Körper (Modul)"), normalizeExamName("Koerper"));
    assert.notEqual(normalizeExamName("Mathematik I (EN)"), normalizeExamName("Mathematik I"));
    assert.notEqual(normalizeExamName("C++"), normalizeExamName("C"));
  });
  check("excludes individual exam windows, by-arrangement, past, and inactive exams", () => {
    assert.equal(schedule.exams[2].individualAppointment, true);
    for (const exam of schedule.exams.slice(2)) assert.equal(isSyncableExam(exam, today), false);
    assert.equal(isSyncableExam({ ...sourceExam, date: "9999-12-31" }, today), false);
  });
  check("rejects invalid dates, changed layouts, login pages, and missing tables", () => {
    for (const value of [page(row("Kurs", "31.02.2027")), "<h1>Login</h1>", page(""), html.replace("<td>09:00</td>", "")]) {
      assert.throws(() => parseTuhhExamSchedule(value));
    }
  });
  const course = { id: "mine", name: "Algorithmen und Datenstrukturen", examDate: new Date(`${future(60)}T00:00:00Z`), sourceCode: null, grade: null, passed: false };
  check("suggests exact names and catalog aliases shared by module code", () => {
    assert.equal(buildExamSyncPreview([course], [], schedule, today).courses[0].suggestedKey, sourceExam.key);
    const preview = buildExamSyncPreview([{ ...course, name: "Mathematics III", sourceCode: "M1732" }], [{ code: "M1732", name: "Mathematik III" }], schedule, today);
    assert.equal(preview.courses[0].suggestedKey, schedule.exams[1].key);
  });
  check("never guesses by substring or silently chooses an ambiguous exam", () => {
    const ambiguous = parseTuhhExamSchedule(page(row(course.name, german(future(30))) + row(course.name, german(future(32)))));
    const match = buildExamSyncPreview([course], [], ambiguous, today).courses[0];
    assert.equal(match.hint, "ambiguous");
    assert.equal(match.suggestedKey, "");
    assert.equal(buildExamSyncPreview([{ ...course, name: "Algorithmen" }], [], schedule, today).courses[0].hint, "unmatched");
  });
  check("keeps correct dates, excludes passed courses, and retains failed attempts", () => {
    const preview = buildExamSyncPreview([
      { ...course, examDate: new Date(`${future(30)}T00:00:00Z`) },
      { ...course, id: "passed", passed: true }, { ...course, id: "graded", grade: 2 },
      { ...course, id: "failed", grade: 5 },
    ], [], schedule, today);
    assert.equal(preview.courses.length, 2);
    assert.equal(preview.courses[0].suggestedKey, "");
    assert.equal(preview.courses[1].id, "failed");
    assert.equal(buildExamSyncPreview([{ ...course, name: "Mathematik I" }], [], schedule, today).courses[0].hint, "individual");
  });
  const input: ExamDateChange = { courseId: "mine", expectedDate: future(60), examKey: sourceExam.key };
  check("validates action input and rejects duplicate ids and unbounded selections", () => {
    assert.deepEqual(parseExamDateChanges([input]), [input]);
    for (const value of [null, [], [input, input], [{ ...input, expectedDate: "2027-02-31" }], [{ ...input, examKey: "fake" }], Array(201).fill(input)]) assert.equal(parseExamDateChanges(value), null);
  });

  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, TUHH_EXAM_URL);
      assert.equal(options?.redirect, "error");
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    };
    assert.equal((await fetchTuhhExamSchedule()).exams[0].key, sourceExam.key);
    checks++; console.log("✓ fetch uses a fixed public source and rejects redirects");
    for (const response of [new Response("unavailable", { status: 503 }), new Response("{}", { headers: { "content-type": "application/json" } }), new Response("x".repeat(2_000_001), { headers: { "content-type": "text/html" } })]) {
      globalThis.fetch = async () => response;
      await assert.rejects(fetchTuhhExamSchedule());
    }
    checks++; console.log("✓ rejects upstream errors, wrong content, and oversized responses");
  } finally { globalThis.fetch = realFetch; }

  const owner = await prisma.user.create({ data: { email: "exam-sync-owner@test.invalid" } });
  const stranger = await prisma.user.create({ data: { email: "exam-sync-other@test.invalid" } });
  const own = await prisma.course.create({ data: {
    userId: owner.id, name: course.name, examDate: course.examDate,
    topics: { create: { title: "Graphs", effort: 2, order: 0 } },
  }, include: { topics: true } });
  const foreign = await prisma.course.create({ data: { userId: stranger.id, name: "Other course", examDate: course.examDate } });
  const passed = await prisma.course.create({ data: { userId: owner.id, name: "Passed", examDate: course.examDate, passed: true } });
  const completed = await prisma.studyBlock.create({ data: {
    courseId: own.id, topicId: own.topics[0].id, topicTitle: "Graphs", date: new Date(`${today}T00:00:00Z`), minutes: 30, completed: true,
  } });
  const changes = [{ ...input, courseId: own.id }];
  await assert.rejects(applyExamDateChanges(owner.id, [...changes, { ...input, courseId: foreign.id }], schedule), ExamSyncConflict);
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: own.id } })).examDate.toISOString().slice(0, 10), future(60));
  checks++; console.log("✓ cross-user writes fail and roll back all selected changes");
  await assert.rejects(applyExamDateChanges(owner.id, [{ ...input, courseId: passed.id }], schedule), ExamSyncConflict);
  await assert.rejects(applyExamDateChanges(owner.id, [{ ...changes[0], expectedDate: future(61) }], schedule), ExamSyncConflict);
  await assert.rejects(applyExamDateChanges(owner.id, [{ ...changes[0], examKey: "a".repeat(64) }], schedule), ExamSyncConflict);
  checks++; console.log("✓ rejects passed courses, stale previews, and removed source exams");
  const result = await applyExamDateChanges(owner.id, changes, schedule);
  assert.deepEqual(result, { updated: 1, planRebuilt: true });
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: own.id } })).examDate.toISOString().slice(0, 10), future(30));
  assert.ok(await prisma.studyBlock.findUnique({ where: { id: completed.id } }));
  assert.equal(await prisma.studyBlock.count({ where: { courseId: own.id, completed: false, date: { gte: new Date(`${future(30)}T00:00:00Z`) } } }), 0);
  assert.ok(await prisma.studyBlock.count({ where: { courseId: own.id, completed: false } }) > 0);
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: foreign.id } })).examDate.toISOString().slice(0, 10), future(60));
  checks++; console.log("✓ saves dates, replans, and preserves completed history and other users");
  await prisma.$disconnect();
  console.log(`\n${checks} exam sync checks passed.`);
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
