import "./testDb";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { saveStudyTaskForUser, recordStudyResult } from "./studyTaskService";
import { startQuickStudy, quickStudySources } from "./practicalStudy";
import { previewSchedule, rebuildSchedule, todayISO, foldCompletedSessions } from "./planService";
import { storeMaterial } from "./materials";
import { createFirstStudyPlan } from "./firstStudyPlan";
import { summarizeLearning } from "./learningEvidence";
import { withRecoveryUndo, undoPlanAdjustment } from "./planAdjustment";
import { assignLanes, computeCapacity, prioritizeBlocks, todayStatusKey, type CockpitBlock } from "../app/today/cockpit";

let checks = 0;
function check(name: string, condition: unknown) { assert.ok(condition, name); checks++; console.log(`  ✓ ${name}`); }
async function main() {
  process.env.OPENAI_API_KEY = ""; process.env.ANTHROPIC_API_KEY = "";
  const user = await prisma.user.create({ data: { email: `experience-${randomUUID()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `experience-other-${randomUUID()}@example.test` } });
  try {
    const today = todayISO();
    const exam = new Date(today + "T00:00:00Z"); exam.setUTCDate(exam.getUTCDate() + 7);
    const course = await prisma.course.create({ data: { userId: user.id, name: "Algorithms", examDate: exam, studyDays: "0,1,2,3,4,5,6" } });
    const parent = await prisma.topic.create({ data: { courseId: course.id, title: "Graph algorithms", effort: 2 } });
    const task = await saveStudyTaskForUser(user.id, { courseId: course.id, topicId: parent.id, title: "Solve graph exercise 2", task: {
      instruction: "Solve exercise 2.", successCriteria: "Check the shortest path against the worked solution.", estimatedMinutes: 15,
    } });
    check("partial work creates a child task", (await prisma.topic.findUniqueOrThrow({ where: { id: task!.id } })).parentTopicId === parent.id);
    check("the broad topic keeps its full original estimate", (await prisma.topic.findUniqueOrThrow({ where: { id: parent.id } })).effort === 2);
    const folded = foldCompletedSessions({ id: course.id, name: course.name, examDate: exam, studyDays: course.studyDays, minutesPerDay: 120,
      topics: [{ id: "parent", title: "Broad", effort: 2, done: false }, { id: "child", title: "Part", effort: 15 / 90, done: false, parentTopicId: "parent" }],
      blocks: [{ topicId: "parent", topicTitle: "Broad", date: new Date(), minutes: 30, completed: true, kind: "study" },
        { topicId: "parent", topicTitle: "Broad", date: new Date(), minutes: 150, completed: false, kind: "study" }],
    }, 1);
    check("allocating a child after earlier study credits completed parent work exactly", Math.abs(folded.topics.reduce((sum, topic) => sum + topic.effort * 90, 0) - 150) < 0.001);
    const before = (await previewSchedule(user.id)).get(course.id)!.blocks.filter((block) => block.kind === "study").reduce((sum, block) => sum + block.minutes, 0);
    check("allocating a task does not double-count its work", before >= 180 && before <= 181);
    const block = await prisma.studyBlock.findFirstOrThrow({ where: { topicId: task!.id, kind: "study", completed: false } });
    await recordStudyResult(user.id, { blockId: block.id, topicId: task!.id, outcome: "complete", response: "", checked: true, actualMinutes: 0 });
    const parentAfter = await prisma.topic.findUniqueOrThrow({ where: { id: parent.id } });
    const childAfter = await prisma.topic.findUniqueOrThrow({ where: { id: task!.id } });
    check("finishing a task leaves its broader topic open", !parentAfter.done && parentAfter.confidence === null);
    check("self-reported completion never automatically declares mastery", childAfter.done && childAfter.confidence === "practice");
    check("the parent's uncovered work remains planned", (await previewSchedule(user.id)).get(course.id)!.blocks.some((block) => block.topicId === parent.id && block.kind === "study"));

    const file = await storeMaterial(user.id, course.id, new File(["Exercise 1: Sorting\nSort these values.\nExercise 2: Graph algorithms\nFind a shortest path."], "exercises.txt"), null);
    const sources = await quickStudySources(user.id, course.id, file!.id, parent.id);
    check("source matching chooses the graph exercise instead of the first excerpt", sources?.suggested === "Lines 3–4");
    check("source previews enforce ownership", await quickStudySources(other.id, course.id, file!.id) === null);
    await assert.rejects(() => startQuickStudy(user.id, { courseId: course.id, fileId: file!.id, topicId: parent.id, sourceRef: "PDF p. 999", mode: "solve", minutes: 15, language: "en" })); checks++;
    const quick = await startQuickStudy(user.id, { courseId: course.id, fileId: file!.id, topicId: parent.id, sourceRef: "Lines 3–4", mode: "solve", minutes: 15, language: "en" });
    check("previewed source starts a concrete session", !!quick?.blockId);
    const repeated = await startQuickStudy(user.id, { courseId: course.id, fileId: file!.id, topicId: parent.id, sourceRef: "Lines 3–4", mode: "solve", minutes: 15, language: "en" });
    check("repeating quick start on a broad topic resumes its child task", repeated?.blockId === quick?.blockId);

    const base: CockpitBlock = { id: "new", topicTitle: "New chapter", course: { id: course.id, name: course.name }, minutes: 60, completed: false, kind: "study", actualMinutes: null, examDays: 20 };
    const weak = { ...base, id: "review", minutes: 15, kind: "review", confidence: "struggling", examDays: 2 };
    check("weak due review beats long new material", prioritizeBlocks([base, weak])[0].id === weak.id);
    check("due reviews stay visible when there is ample time", assignLanes([base, weak], computeCapacity(75, 120)).get(weak.id) !== "slide");
    check("exam overload remains visible after today's work is done", todayStatusKey("doesnt_fit", true) === "today.statusDoesntFit");

    const recorded = (outcome: "complete" | "practice", recordedAt: string) => JSON.stringify({ version: 1, outcome, recordedAt });
    const learning = summarizeLearning([
      { topicId: "t", kind: "study", studyResult: recorded("complete", "2026-10-20T10:00:00Z") },
      { topicId: "t", kind: "review", studyResult: recorded("complete", "2026-10-20T10:15:00Z") },
    ]);
    check("an immediate repeated check is not counted as delayed recall", learning.goalsMet === 1 && learning.laterRecall === 0);
    check("a later recall attempt is reported separately", summarizeLearning([
      { topicId: "t", kind: "study", studyResult: recorded("complete", "2026-10-20T10:00:00Z") },
      { topicId: "t", kind: "review", studyResult: recorded("complete", "2026-10-22T10:00:00Z") },
    ]).laterRecall === 1);

    const original = await prisma.studyBlock.findMany({ where: { completed: false, course: { userId: user.id } }, orderBy: { id: "asc" } });
    await withRecoveryUndo(user.id, async () => {
      await prisma.studyBlock.updateMany({ where: { completed: false, course: { userId: user.id } }, data: { date: new Date(exam.getTime() - 86400000) } });
    });
    check("another user cannot undo this user's adjustment", !await undoPlanAdjustment(other.id));
    check("undo restores the prior schedule", await undoPlanAdjustment(user.id));
    assert.deepEqual(await prisma.studyBlock.findMany({ where: { completed: false, course: { userId: user.id } }, orderBy: { id: "asc" } }), original); checks++;
    const doneCount = await prisma.studyBlock.count({ where: { completed: true, course: { userId: user.id } } });
    await withRecoveryUndo(user.id, () => rebuildSchedule(user.id));
    const changed = await prisma.studyBlock.findFirstOrThrow({ where: { completed: false, course: { userId: user.id } } });
    await prisma.studyBlock.update({ where: { id: changed.id }, data: { completed: true } });
    check("undo refuses to erase study completed after adjustment", !await undoPlanAdjustment(user.id));
    check("completed work remains durable", await prisma.studyBlock.count({ where: { completed: true, course: { userId: user.id } } }) === doneCount + 1);

    const form = new FormData(); form.set("name", "First course"); form.set("examDate", exam.toISOString().slice(0,10)); form.set("dailyBudgetMin", "45");
    form.append("studyDays", "1"); form.append("studyDays", "3"); form.set("sourceRef", "Chapter 2, exercises 1–3"); form.set("requestId", randomUUID());
    const first = await createFirstStudyPlan(other.id, form);
    check("setup leads directly to a first study task", first.path.startsWith("/focus?blockId="));
    check("setup saves the explicitly selected capacity", JSON.parse((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).preferences!).dailyBudgetMin === 45);
    await createFirstStudyPlan(other.id, form);
    check("retrying setup does not duplicate the course", await prisma.course.count({ where: { userId: other.id } }) === 1);
    const invalid = new FormData(); invalid.set("name", "Invalid"); invalid.set("examDate", exam.toISOString().slice(0,10)); invalid.set("dailyBudgetMin", "900");
    await assert.rejects(() => createFirstStudyPlan(other.id, invalid)); checks++;
  } finally {
    await prisma.course.deleteMany({ where: { userId: { in: [user.id, other.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
  }
  console.log(`\n${checks} study experience checks passed`);
}
main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
