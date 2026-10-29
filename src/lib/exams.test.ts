import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { applyExamDateChanges, ExamSyncConflict, getRemainingExams, readStoredExamSchedule, refreshMatchedExamDates } from "./examSync";
import { parseTuhhExamSchedule } from "./tuhhExams";
import { todayISO } from "./planService";
import { getExamOptions } from "../app/exams/actions";

const today = todayISO();
const date = (offset: number) => {
  const value = new Date(`${today}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
const instant = (offset: number) => new Date(`${date(offset)}T00:00:00Z`);
const row = (name: string, offset: number | null, note = "") => `<tr class="titleline"><td><strong>${name} (Modul)</strong></td></tr>
  <tr class="dataline"><td>${offset === null ? "nach Vereinbarung" : date(offset).split("-").reverse().join(".")}</td><td>09:00</td><td>Hörsaal A</td><td>Prüfer</td></tr>
  <tr class="commentline"><td>${note}</td></tr>`;
const schedule = (aliasOffset = 30) => parseTuhhExamSchedule(`<h2>Prüfungszeitraum: Wintersemester 2026/27</h2><table>
  ${row("Algorithmen", 20)}${row("Mathematik III", aliasOffset)}${row("Wiederholung", 40)}
  ${row("Mathematik I", 21, "Individuelle Termine vom 01.02. bis 10.02.2027")}
  ${row("Physik", 22)}${row("Physik", 25)}${row("Vereinbarung", null)}${row("Alte Prüfung", -2)}
</table>`);
let checks = 0;
function passed(message: string) { checks++; console.log(`✓ ${message}`); }

async function main() {
  assert.equal(readStoredExamSchedule(null), null);
  for (const raw of ["broken", "null", "{}", JSON.stringify({ ...schedule(), exams: [{ title: "Broken" }] })]) assert.equal(readStoredExamSchedule(raw), null);
  const stored = schedule();
  assert.deepEqual(readStoredExamSchedule(JSON.stringify(stored)), stored);
  passed("missing or corrupt cached schedules fail safely");

  const owner = await prisma.user.create({ data: { email: "dev@studyflow.local" } });
  const stranger = await prisma.user.create({ data: { email: "other-exams@test.invalid" } });
  const create = (name: string, extra = {}) => prisma.course.create({ data: { name, userId: owner.id, examDate: instant(70), ...extra } });
  const exact = await create("Algorithmen");
  const alias = await create("Mathematics III", { sourceCode: "M-EXAMS", examDate: instant(-1) });
  const failed = await create("Retake", { grade: 5, examSourceTitle: "Wiederholung (Modul)" });
  const individual = await create("Mathematik I");
  const ambiguous = await create("Physik");
  const unknown = await create("My custom course");
  const old = await create("Old ungraded course", { examDate: instant(-4) });
  const done = await create("Algorithmen", { passed: true });
  const graded = await create("Algorithmen", { grade: 2 });
  const foreign = await prisma.course.create({ data: { name: "Algorithmen", userId: stranger.id, examDate: instant(70) } });
  await prisma.moduleTemplate.create({ data: { university: "TUHH", program: "TEST", code: "M-EXAMS", name: "Mathematik III", section: "Test", ects: 6, content: "Test" } });
  const topic = await prisma.topic.create({ data: { courseId: exact.id, title: "Graphs", order: 0, effort: 1 } });
  const completed = await prisma.studyBlock.create({ data: { courseId: exact.id, topicId: topic.id, topicTitle: topic.title, date: instant(0), minutes: 30, actualMinutes: 20, completed: true } });
  const initial = await getRemainingExams(owner.id);
  assert.equal(initial.checkedAt, null);
  assert.equal(initial.courses.length, 7);
  assert.equal(initial.courses.at(-1)?.id, alias.id);
  assert.equal(initial.courses.at(-2)?.id, old.id);
  assert.ok(initial.courses.every((course) => ![done.id, graded.id, foreign.id].includes(course.id)));
  passed("lists only owned remaining courses, including failed attempts and old dates");

  const firstSchedule = schedule();
  assert.deepEqual(await refreshMatchedExamDates(owner.id, firstSchedule), { updated: 3, planRebuilt: true });
  const refreshed = await getRemainingExams(owner.id);
  assert.equal(refreshed.checkedAt, firstSchedule.checkedAt);
  assert.equal(refreshed.semester, firstSchedule.semester);
  assert.deepEqual(refreshed.courses.slice(0, 3).map((course) => course.id), [exact.id, alias.id, failed.id]);
  assert.equal(refreshed.courses.find((course) => course.id === exact.id)?.published?.location, "Hörsaal A");
  assert.equal(refreshed.courses.find((course) => course.id === exact.id)?.published?.time, "09:00");
  assert.equal(refreshed.courses.find((course) => course.id === alias.id)?.currentDate, date(30));
  passed("one refresh saves exact names, catalog aliases and selected titles in date order");

  for (const [course, hint] of [[individual, "individual"], [ambiguous, "ambiguous"], [unknown, "unmatched"]] as const) {
    const result = refreshed.courses.find((entry) => entry.id === course.id)!;
    assert.equal(result.currentDate, date(70));
    assert.equal(result.hint, hint);
    assert.equal(result.published, null);
  }
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: foreign.id } })).examDate.toISOString().slice(0, 10), date(70));
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: done.id } })).examDate.toISOString().slice(0, 10), date(70));
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: graded.id } })).examDate.toISOString().slice(0, 10), date(70));
  passed("ambiguous, individual, unmatched, passed and foreign courses are not overwritten");

  assert.deepEqual(await prisma.studyBlock.findUnique({ where: { id: completed.id } }), completed);
  assert.equal(await prisma.studyBlock.count({ where: { courseId: exact.id, completed: false, date: { gte: instant(20) } } }), 0);
  const blockIds = (await prisma.studyBlock.findMany({ where: { courseId: exact.id }, orderBy: { id: "asc" } })).map((block) => block.id);
  assert.deepEqual(await refreshMatchedExamDates(owner.id, firstSchedule), { updated: 0, planRebuilt: true });
  assert.deepEqual((await prisma.studyBlock.findMany({ where: { courseId: exact.id }, orderBy: { id: "asc" } })).map((block) => block.id), blockIds);
  passed("rebuild respects new dates, keeps completed history and repeated checks do not replan");

  const options = await getExamOptions(unknown.id);
  assert.ok(options.ok);
  assert.ok(options.exams.length > 0);
  assert.ok(options.exams.every((exam) => exam.date && exam.date >= today && !exam.title.includes("Mathematik I (")));
  assert.deepEqual(await getExamOptions(foreign.id), { ok: false, reason: "invalid" });
  assert.deepEqual(await getExamOptions(done.id), { ok: false, reason: "invalid" });
  passed("exam chooser is private and only offers upcoming fixed appointments");

  const chosen = firstSchedule.exams.find((exam) => exam.title.startsWith("Mathematik III"))!;
  await applyExamDateChanges(owner.id, [{ courseId: unknown.id, expectedDate: date(70), examKey: chosen.key }], firstSchedule);
  assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: unknown.id } })).examSourceTitle, chosen.title);
  assert.equal((await getRemainingExams(owner.id)).courses.find((course) => course.id === unknown.id)?.hint, "matched");
  assert.equal((await refreshMatchedExamDates(owner.id, schedule(31))).updated, 2);
  assert.equal((await getRemainingExams(owner.id)).courses.find((course) => course.id === unknown.id)?.currentDate, date(31));
  passed("explicit matches survive reopening and follow later official date changes");

  const before = (await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).examSchedule;
  await assert.rejects(applyExamDateChanges(owner.id, [{ courseId: foreign.id, expectedDate: date(70), examKey: chosen.key }], firstSchedule), ExamSyncConflict);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).examSchedule, before);
  const withdrawal = parseTuhhExamSchedule(`<h2>Prüfungszeitraum: Wintersemester 2026/27</h2><table>${row("Algorithmen", null)}</table>`);
  assert.equal((await refreshMatchedExamDates(owner.id, withdrawal)).updated, 0);
  const withdrawn = (await getRemainingExams(owner.id)).courses.find((course) => course.id === exact.id)!;
  assert.equal(withdrawn.currentDate, date(20));
  assert.equal(withdrawn.hint, "unpublished");
  assert.equal(withdrawn.published, null);
  passed("rejected changes preserve the cache and withdrawn dates retain the saved date without verification");

  await prisma.course.updateMany({ where: { userId: owner.id }, data: { passed: true } });
  assert.deepEqual((await getRemainingExams(owner.id)).courses, []);
  assert.equal((await getRemainingExams(stranger.id)).checkedAt, null);
  passed("all-passed state is empty and checked schedules never cross accounts");
  await prisma.$disconnect();
  console.log(`\n${checks} exams page checks passed.`);
}

main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
