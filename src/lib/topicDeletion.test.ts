import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { deleteTopicForUser } from "./topicDeletion";

async function main() {
  const owner = await prisma.user.create({ data: { email: "topic-owner@test.local" } });
  const other = await prisma.user.create({ data: { email: "topic-other@test.local" } });
  const course = await prisma.course.create({ data: { userId: owner.id, name: "Topics", examDate: new Date("2027-02-09") } });
  const topic = await prisma.topic.create({ data: { courseId: course.id, title: "Remove this" } });
  const child = await prisma.topic.create({ data: { courseId: course.id, parentTopicId: topic.id, title: "Keep this child", note: { create: { body: "Child note" } } } });
  await prisma.note.create({ data: { topicId: topic.id, body: "Topic scratchpad" } });
  await prisma.focusNote.create({ data: { topicId: topic.id, body: "Session note" } });
  const base = { courseId: course.id, topicId: topic.id, topicTitle: topic.title, date: new Date("2026-10-29"), minutes: 30 };
  const history = await prisma.studyBlock.create({ data: { ...base, completed: true, actualMinutes: 21 } });
  const partial = await prisma.studyBlock.create({ data: { ...base, actualMinutes: 7 } });
  const future = await prisma.studyBlock.create({ data: base });
  const childBlock = await prisma.studyBlock.create({ data: { ...base, topicId: child.id, topicTitle: child.title } });
  assert.equal(await deleteTopicForUser(other.id, topic.id), null);
  assert.equal(await prisma.topic.count({ where: { id: topic.id } }), 1);
  assert.equal(await prisma.studyBlock.count({ where: { courseId: course.id } }), 4);
  console.log("✓ A foreign user cannot delete a topic, notes or its plan");
  assert.equal(await deleteTopicForUser(owner.id, topic.id), course.id);
  assert.equal(await prisma.topic.count({ where: { id: topic.id } }), 0);
  assert.equal(await prisma.note.count({ where: { topicId: topic.id } }), 0);
  assert.equal(await prisma.focusNote.count({ where: { topicId: topic.id } }), 0);
  assert.equal(await prisma.studyBlock.count({ where: { id: future.id } }), 0);
  console.log("✓ Confirmed deletion removes the topic, its notes and unstarted future work");
  assert.deepEqual(await prisma.studyBlock.findUnique({ where: { id: history.id } }), history);
  const kept = await prisma.studyBlock.findUniqueOrThrow({ where: { id: partial.id } });
  assert.equal(kept.completed, true); assert.equal(kept.minutes, 7); assert.equal(kept.actualMinutes, 7);
  console.log("✓ Completed history stays unchanged; partially logged sessions retain actual study time");
  assert.equal((await prisma.topic.findUniqueOrThrow({ where: { id: child.id } })).parentTopicId, null);
  assert.equal((await prisma.note.findUniqueOrThrow({ where: { topicId: child.id } })).body, "Child note");
  assert.equal(await prisma.studyBlock.count({ where: { id: childBlock.id } }), 1);
  console.log("✓ Child topics and their notes and plan remain intact");
  assert.equal(await deleteTopicForUser(owner.id, topic.id), null);
  assert.equal(await deleteTopicForUser(owner.id, "missing-topic"), null);
  console.log("✓ Repeated and stale deletions safely report no change");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
