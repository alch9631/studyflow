import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { allocateMinutes } from "./scheduleAllocator";
import { applySuggestedStudyOrder, calculateSchedule, calibrationFromHistory, previewSchedule, rebuildSchedule, todayISO } from "./planService";
import { placeDayBlocks } from "./timePlacer";
import { saveTopicPlanningForUser } from "./topicPlanningService";
import { dayMinutesToInstant } from "./calendarTime";
import { addDaysISO } from "./planner";
import { withRecoveryUndo, undoPlanAdjustment } from "./planAdjustment";
import { prioritizeBlocks, type CockpitBlock } from "../app/today/cockpit";

type Input = Parameters<typeof calculateSchedule>[0];
const today = "2026-11-03";
const prefs = { dayStartMin: 480, dayEndMin: 1320, energy: "any" as const, dailyBudgetMin: 180 };
const date = (day: string) => new Date(day + "T00:00:00Z");
function course(id: string, minutes: number, exam = "2026-11-11"): Input["courses"][number] {
  return { id, name: id, examDate: date(exam), studyDays: "0,1,2,3,4,5,6", minutesPerDay: 180,
    difficulty: 3, grade: null, passed: false, assignments: [], blocks: [], topics: [
      { id: id + "-t", title: id, effort: minutes / 90, done: false, confidence: "practice", studyTask: null, parentTopicId: null, planning: null, questions: null },
    ] };
}
const plan = (courses: Input["courses"], options: Partial<Omit<Input, "courses">> = {}) => calculateSchedule({ courses, lectures: [], prefs, ...options }, today);
const sum = (values: { minutes: number }[]) => values.reduce((total, value) => total + value.minutes, 0);

async function main() {
  const uneven = allocateMinutes([{ id: "a", minutes: 120, dates: ["tue", "wed"], deadline: "thu", importance: 3 }], new Map([["tue", 90], ["wed", 30]]));
  assert.deepEqual(Object.fromEntries(uneven.get("a")!), { tue: 90, wed: 30 }, "use free capacity before a busy day");
  const scarce = allocateMinutes([
    { id: "flexible", minutes: 90, dates: ["tue", "wed"], deadline: "thu", importance: 3 },
    { id: "scarce", minutes: 60, dates: ["tue"], deadline: "fri", importance: 3 },
  ], new Map([["tue", 90], ["wed", 90]]));
  assert.equal([...scarce.values()].reduce((total, days) => total + [...days.values()].reduce((a, b) => a + b, 0), 0), 150, "reverse allocation repairs course-order starvation");
  // Exhaust small capacities and eligibility sets against brute-force assignment.
  for (let first = 0; first <= 4; first++) for (let second = 0; second <= 4; second++) {
    const jobs = [{ id: "flex", minutes: first, dates: ["a", "b"], deadline: "c", importance: 3 }, { id: "fixed", minutes: second, dates: ["a"], deadline: "d", importance: 3 }];
    const allocations = allocateMinutes(jobs, new Map([["a", 3], ["b", 2]]));
    const placed = [...allocations.values()].reduce((total, days) => total + [...days.values()].reduce((a, b) => a + b, 0), 0);
    const optimum = Math.min(first + Math.min(second, 3), 5);
    assert.equal(placed, optimum, "small allocation matches exact feasible maximum");
  }
  const c = course("uneven", 120, "2026-11-05"); c.topics[0].confidence = "solid";
  const scheduled = plan([c], { prefs: { ...prefs, dayEndMin: 600 }, lectures: [{ weekday: 3, startMin: 520, endMin: 600 }] }).get(c.id)!;
  assert.equal(scheduled.isOverloaded, false);
  assert.equal(sum(scheduled.blocks.filter(block => block.date === today)), 90);
  assert.equal(sum(scheduled.blocks.filter(block => block.date === "2026-11-04")), 30);

  const spaced = plan([course("spaced", 360)]).get("spaced")!;
  assert.ok(spaced.blocks.some(block => block.kind === "review"), "even pacing leaves recall sessions");
  assert.equal(sum(spaced.blocks.filter(block => block.kind === "study")), 360);
  assert.ok(spaced.blocks.some(block => block.kind === "review" && block.date === "2026-11-10"), "reserve a final recall checkpoint");
  const overloaded = plan([course("large", 3000)], { prefs: { ...prefs, dailyBudgetMin: 60 } }).get("large")!;
  assert.ok(overloaded.unscheduled.length > 0 && overloaded.isOverloaded);
  for (const day of new Set(overloaded.blocks.map(block => block.date))) assert.ok(sum(overloaded.blocks.filter(block => block.date === day)) <= 60, "no impossible pile-on day");
  assert.equal(sum(overloaded.blocks.filter(block => block.kind === "study")) + sum(overloaded.unscheduled.filter(block => block.kind === "study")), 3000, "calendar plus backlog conserves all work");
  const learned = course("learned", 90); learned.topics[0].done = true;
  learned.blocks.push({ id: "done", topicId: "learned-t", topicTitle: "learned", date: date("2026-11-01"), minutes: 90, completed: true, kind: "study", actualMinutes: 90, startTime: null, endTime: null,
    studyResult: JSON.stringify({ version: 1, outcome: "complete", recordedAt: "2026-11-02T12:00:00Z" }) });
  const recall = plan([learned]).get("learned")!;
  assert.ok(recall.blocks.some(block => block.kind === "review" && block.date === today), "actual completion creates due recall even when no fresh study exists");
  const full = plan([learned], { prefs: { ...prefs, dailyBudgetMin: 15 } }).get("learned")!;
  assert.ok(full.unscheduled.some(block => block.kind === "review") && full.isOverloaded, "unfitted reviews contribute to overload");
  assert.equal(full.blocks.length, 0, "reviews never bypass the capacity ceiling");

  for (const energy of ["any", "morning", "evening"] as const) {
    const placed = placeDayBlocks([{ id: "short", minutes: 20 }, { id: "long", minutes: 30 }], [{ startMin: 30, endMin: 60 }], { startMin: 0, endMin: 80 }, energy);
    assert.equal(placed.unplaced.length, 0, "repair fragmented free gaps");
  }
  const evidence = (activity: string) => Array.from({ length: 3 }, (_, i) => ({ topicId: "task-" + i, minutes: 60, actualMinutes: 15, completed: true, kind: "study", studyResult: JSON.stringify({ version: 1, outcome: "complete", baselineMinutes: 30, totalActualMinutes: 90, activity, recordedAt: `2026-11-0${i + 1}T12:00:00Z` }) }));
  assert.ok(calibrationFromHistory(evidence("solve"), "solve") > 1, "successful task evidence includes the cost of earlier attempts against an unscaled baseline");
  assert.equal(calibrationFromHistory(evidence("solve"), "read"), 1, "solving pace cannot change reading estimates");
  assert.equal(calibrationFromHistory(evidence("solve").map(block => ({ ...block, kind: "review" }))), 1, "recall pace cannot change initial-learning estimates");
  assert.equal(calibrationFromHistory(evidence("solve").map(block => ({ ...block, topicId: "one-task" }))), 1, "one task is not three independent samples");
  const committed = course("committed", 60);
  committed.blocks = [0, 1].map(index => ({ id: `commit-${index}`, topicId: "committed-t", topicTitle: "committed", date: date(addDaysISO(today, index)), minutes: 30, completed: false, kind: "study", actualMinutes: null, studyResult: null,
    startTime: dayMinutesToInstant(addDaysISO(today, index), 540), endTime: dayMinutesToInstant(addDaysISO(today, index), 570) }));
  const committedPlan = plan([committed]).get("committed")!;
  assert.equal(committedPlan.blocks.filter(block => block.id).length, 2);
  assert.ok(committedPlan.blocks.some(block => block.kind === "review"), "fully timed study still earns recall forecasts");
  const base: CockpitBlock = { id: "normal", topicTitle: "normal", minutes: 30, completed: false, kind: "study", actualMinutes: null, course: { id: "c", name: "c" }, examDays: 30 };
  assert.equal(prioritizeBlocks([base, { ...base, id: "assignment", deadlineDays: 1 }])[0].id, "assignment", "assignment slack participates in today's queue");
  assert.equal(prioritizeBlocks([base, { ...base, id: "important", importance: 5 }])[0].id, "important", "student importance resolves equal urgency");

  const user = await prisma.user.create({ data: { email: "scheduling@example.test", preferences: JSON.stringify(prefs) } });
  const now = todayISO();
  const stored = await prisma.course.create({ data: { userId: user.id, name: "Dependencies", examDate: date(addDaysISO(now, 20)), studyDays: "0,1,2,3,4,5,6",
    topics: { create: [{ title: "Foundation", effort: 1, order: 0 }, { title: "Advanced", effort: 1, order: 1 }] } }, include: { topics: { orderBy: { order: "asc" } } } });
  const [foundation, advanced] = stored.topics;
  const settings = { prerequisites: [foundation.id], importance: 4 };
  assert.equal(await saveTopicPlanningForUser(user.id, advanced.id, settings), true);
  let proposal = (await previewSchedule(user.id)).get(stored.id)!;
  assert.ok(proposal.unscheduled.some(item => item.topicId === advanced.id && item.reason === "prerequisite"));
  assert.ok(!proposal.blocks.some(item => item.topicId === advanced.id));
  await assert.rejects(saveTopicPlanningForUser(user.id, foundation.id, { prerequisites: [advanced.id] }), /cycle/);
  assert.equal(await saveTopicPlanningForUser("foreign-user", advanced.id, settings), false, "planning changes are ownership-scoped");
  await assert.rejects(saveTopicPlanningForUser(user.id, advanced.id, { prerequisites: ["foreign-topic"] }), /this course/);
  await prisma.topic.update({ where: { id: foundation.id }, data: { done: true } });
  const assignment = await prisma.assignment.create({ data: { courseId: stored.id, title: "Exercise sheet", dueDate: date(addDaysISO(now, 3)) } });
  await saveTopicPlanningForUser(user.id, advanced.id, { ...settings, assignmentId: assignment.id });
  proposal = (await previewSchedule(user.id)).get(stored.id)!;
  assert.ok(proposal.blocks.some(item => item.topicId === advanced.id), "confirming a prerequisite activates dependent work");
  assert.ok(proposal.blocks.filter(item => item.topicId === advanced.id).every(item => item.date < addDaysISO(now, 3)), "linked assignment deadline bounds its work");
  const pinned = await prisma.studyBlock.create({ data: { courseId: stored.id, topicId: advanced.id, topicTitle: advanced.title, date: date(now), minutes: 30,
    startTime: dayMinutesToInstant(now, 540), endTime: dayMinutesToInstant(now, 570) } });
  await rebuildSchedule(user.id);
  const retained = await prisma.studyBlock.findUniqueOrThrow({ where: { id: pinned.id } });
  assert.equal(retained.startTime!.getTime(), pinned.startTime!.getTime(), "timed commitments retain identity and clock times");
  await rebuildSchedule(user.id);
  assert.ok(await prisma.studyBlock.findUnique({ where: { id: pinned.id } }), "repeated rebuild keeps the same commitment");
  await withRecoveryUndo(user.id, async () => { await prisma.studyBlock.update({ where: { id: pinned.id }, data: { minutes: 25 } }); });
  await prisma.assignment.update({ where: { id: assignment.id }, data: { dueDate: date(addDaysISO(now, 2)) } });
  assert.equal(await undoPlanAdjustment(user.id), false, "undo refuses to overwrite later assignment-deadline changes");
  const beforeAI = await prisma.topic.findMany({ where: { courseId: stored.id }, orderBy: { id: "asc" }, select: { id: true, title: true, effort: true, done: true, studyTask: true } });
  await applySuggestedStudyOrder(stored.id, [{ title: advanced.title, isReview: false }, { title: "Review: Advanced", isReview: true }, { title: "Invented", isReview: false }]);
  assert.deepEqual(await prisma.topic.findMany({ where: { courseId: stored.id }, orderBy: { id: "asc" }, select: { id: true, title: true, effort: true, done: true, studyTask: true } }), beforeAI, "AI ordering cannot change estimates, completion or introduce revision topics");
  console.log("Scheduling regressions: capacity, scarce dates, recall, backlog, task evidence, prerequisites, deadlines, priority, packing and commitments passed");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
