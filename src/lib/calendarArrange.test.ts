import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { arrangeCalendarTimes } from "./calendarArrange";
import { dayMinutesToInstant, instantToDayMinutes } from "./calendarTime";

async function main() {
  const user = await prisma.user.create({ data: { email: "arrange@example.test", preferences: JSON.stringify({ dayStartMin: 480, dayEndMin: 540, energy: "any" }) } });
  const other = await prisma.user.create({ data: { email: "arrange-other@example.test" } });
  const course = await prisma.course.create({ data: { userId: user.id, name: "Numerical mathematics", examDate: new Date("2027-02-09T00:00:00Z") } });
  const foreign = await prisma.course.create({ data: { userId: other.id, name: "Private course", examDate: course.examDate } });
  let sequence = 0;
  const block = (date: string, extra: { completed?: boolean; courseId?: string; startTime?: Date; endTime?: Date } = {}) => prisma.studyBlock.create({ data: { id: `arrange-${++sequence}`, topicId: "legacy", topicTitle: "Machine numbers", courseId: course.id, date: new Date(date + "T00:00:00Z"), minutes: 30, ...extra } });
  const a = await block("2026-10-26"), b = await block("2026-10-26"), done = await block("2026-10-26", { completed: true }), hidden = await block("2026-10-26", { courseId: foreign.id });
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-26"), { placed: 2, unplaced: 0 }, "optional breaks must not strand tasks that fit");
  const read = (id: string) => prisma.studyBlock.findUniqueOrThrow({ where: { id } });
  const first = await read(a.id), second = await read(b.id);
  assert.equal(first.endTime!.getTime(), second.startTime!.getTime());
  assert.equal((await read(done.id)).startTime, null, "completed work is never arranged");
  assert.equal((await read(hidden.id)).startTime, null, "other users are untouched");
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-26"), { placed: 0, unplaced: 0 }, "repeating Arrange preserves timed work");
  assert.equal((await read(a.id)).startTime!.getTime(), first.startTime!.getTime());

  const tuesday = await block("2026-10-27"), wednesday = await block("2026-10-28");
  await prisma.lecture.create({ data: { userId: user.id, title: "Full window", weekday: 3, startMin: 480, endMin: 540 } });
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-27"), { placed: 1, unplaced: 0 });
  assert.ok((await read(tuesday.id)).startTime);
  assert.equal((await read(wednesday.id)).startTime, null, "a day-scoped Arrange cannot change another day");
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-28"), { placed: 0, unplaced: 1 }, "a genuinely full window is reported honestly");

  const partial = await block("2026-10-29", { startTime: dayMinutesToInstant("2026-10-29", 480) });
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-29"), { placed: 1, unplaced: 0 });
  assert.ok((await read(partial.id)).endTime, "legacy half-timed records are repairable");
  const pinned = await block("2026-10-30", { startTime: dayMinutesToInstant("2026-10-30", 480), endTime: dayMinutesToInstant("2026-10-30", 510) });
  const after = await block("2026-10-30");
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-30"), { placed: 1, unplaced: 0 });
  assert.equal((await read(pinned.id)).startTime!.getTime(), pinned.startTime!.getTime(), "manual times are never overwritten");
  assert.equal((await read(after.id)).startTime!.getTime(), pinned.endTime!.getTime(), "new work fits around pinned times");
  await prisma.user.update({ where: { id: user.id }, data: { preferences: JSON.stringify({ dayStartMin: 480, dayEndMin: 600, energy: "any" }) } });
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-28"), { placed: 1, unplaced: 0 });
  assert.equal(instantToDayMinutes((await read(wednesday.id)).startTime!), 540, "widening the window recovers the unplaced session");
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26", "2026-11-02"), { placed: 0, unplaced: 0 }, "a forged day outside the week is rejected");
  assert.deepEqual(await arrangeCalendarTimes(user.id, "invalid"), { placed: 0, unplaced: 0 });
  await block("2026-10-31"); await block("2026-11-01");
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-10-26"), { placed: 2, unplaced: 0 }, "desktop week arrangement still handles all remaining days");
  await block("2026-10-31");
  const concurrent = await Promise.all([arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-31"), arrangeCalendarTimes(user.id, "2026-10-26", "2026-10-31")]);
  assert.equal(concurrent.reduce((sum, result) => sum + result.placed, 0), 1, "concurrent calls cannot overwrite a placement");

  await prisma.user.update({ where: { id: user.id }, data: { preferences: JSON.stringify({ dayStartMin: 120, dayEndMin: 150, energy: "any" }) } });
  const dst = await block("2026-03-29");
  assert.deepEqual(await arrangeCalendarTimes(user.id, "2026-03-23", "2026-03-29"), { placed: 0, unplaced: 1 }, "missing spring-forward times cannot move outside the requested window");
  assert.equal((await read(dst.id)).startTime, null);
  console.log("Calendar Arrange: ownership, selected day, completed tasks, spacing, pinned times, recovery, invalid dates and DST passed");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
