import "./testDb";
import "next/dist/server/node-environment-baseline";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { createMobileGrant, exchangeMobileGrant, mobileHash } from "./mobileAuth";
import { GET, POST } from "../app/api/mobile/[...path]/route";
import { authenticatedMobileUser, withAuthenticatedMobileUser } from "./mobileUserContext";
import { getCurrentUserId } from "./devUser";
import { todayISO } from "./planService";
import { mobileForm } from "./mobileActions";
import { practiceForUser } from "./practice";
import { quickStudyTask } from "./studyTask";
import { uploadBatch } from "../../shared/upload-batch";
import { mobileSaveProgress } from "./mobileStudy";
import { createWorkStore } from "next/dist/server/async-storage/work-store";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { IncrementalCache } from "next/dist/server/lib/incremental-cache";

let passed = 0;
async function check(name: string, run: () => Promise<void> | void) { await run(); console.log(`  ✓ ${name}`); passed++; }
function request(path: string, token?: string, fields?: unknown) {
  const method = fields === undefined ? "GET" : "POST";
  const req = new Request(`http://localhost/api/mobile/${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(fields === undefined ? {} : { "Content-Type": "application/json" }) },
    body: fields === undefined ? undefined : JSON.stringify({ fields }) });
  const store = createWorkStore({ page: "/api/mobile/[...path]/route", buildId: "test", deploymentId: "test", previouslyRevalidatedTags: [], renderOpts: {
    supportsDynamicResponse: true, cacheComponents: false, experimental: { authInterrupts: false }, waitUntil: undefined, onClose: () => {}, onAfterTaskError: undefined,
    incrementalCache: new IncrementalCache({ dev: true, requestHeaders: {}, getPrerenderManifest: () => ({ version: 4, routes: {}, dynamicRoutes: {}, notFoundRoutes: [], preview: { previewModeId: "test", previewModeSigningKey: "test", previewModeEncryptionKey: "test" } }) }),
  } });
  return workAsyncStorage.run(store, () => (method === "GET" ? GET : POST)(req, { params: Promise.resolve({ path: path.split("?")[0].split("/") }) }));
}
async function main() {
  const owner = await prisma.user.create({ data: { email: "workspace-owner@example.test" } });
  const other = await prisma.user.create({ data: { email: "workspace-other@example.test" } });
  const today = todayISO(); const exam = new Date(Date.parse(today) + 30 * 86400_000);
  const course = await prisma.course.create({ data: { userId: owner.id, name: "Owned mathematics", examDate: exam, ects: 6,
    topics: { create: [{ title: "Vectors", done: true }, { title: "Matrices", done: false }] } }, include: { topics: true } });
  const child = await prisma.topic.create({ data: { courseId: course.id, title: "Vector recall", parentTopicId: course.topics[0].id, done: true } });
  const privateCourse = await prisma.course.create({ data: { userId: other.id, name: "Private physics", examDate: exam, grade: 1, ects: 100,
    topics: { create: { title: "Private topic" } } }, include: { topics: true } });
  await prisma.studyBlock.create({ data: { courseId: course.id, topicId: course.topics[0].id, topicTitle: "Vectors", date: new Date(today), minutes: 30, actualMinutes: 25, completed: true } });
  await prisma.note.create({ data: { topicId: privateCourse.topics[0].id, body: "Private scratchpad" } });
  const file = await prisma.moduleFile.create({ data: { courseId: course.id, filename: "notes.txt", content: Buffer.from("Never include original bytes in a list") } });
  const verifier = "x".repeat(64); const token = (await exchangeMobileGrant(await createMobileGrant(owner.id, mobileHash(verifier)), verifier)).token;
  await check("every workspace endpoint requires a bearer session", async () => {
    for (const path of ["courses", `courses/${course.id}`, "exams", "insights", "calendar", "catalog", "preferences", `practice?courseId=${course.id}`]) assert.equal((await request(path)).status, 401);
    assert.equal((await request("actions/saveGrade", undefined, { courseId: course.id, grade: "1.0" })).status, 401);
  });
  await check("course progress counts root topics without counting child tasks twice", async () => {
    const response = await request("courses", token); assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.length, 1); assert.equal(data[0].topicsTotal, 2); assert.equal(data[0].topicsDone, 1); assert.equal(data[0].loggedMinutes, 25);
    assert.match(response.headers.get("Cache-Control")!, /no-store/);
  });
  await check("course detail never exposes another user's notes or original file bytes", async () => {
    assert.equal((await request(`courses/${privateCourse.id}`, token)).status, 404);
    const response = await request(`courses/${course.id}`, token); const data = await response.json();
    assert.equal(data.files[0].id, file.id); assert.equal("content" in data.files[0], false); assert.equal(data.topics.find((t: { id: string }) => t.id === child.id).parentTopicId, course.topics[0].id);
    assert.equal(JSON.stringify(data).includes("Private scratchpad"), false);
  });
  await check("remaining exams and earned credits follow the web pass rules", async () => {
    await prisma.course.update({ where: { id: course.id }, data: { grade: 2 } });
    let data = await (await request("exams", token)).json(); assert.equal(data.courses.length, 0); assert.equal(data.results[0].grade, 2);
    const stats = await (await request("insights", token)).json(); assert.equal(stats.grades.lpEarned, 6); assert.equal(stats.grades.gpa, 2); assert.equal(stats.loggedMinutes, 25);
    await prisma.course.update({ where: { id: course.id }, data: { grade: 5 } });
    data = await (await request("exams", token)).json(); assert.equal(data.courses.length, 1); assert.equal(data.courses[0].id, course.id);
  });
  await check("unmarking a result clears passing grades and the manual flag while ordinary flag edits retain grades", async () => {
    const result = await prisma.course.create({ data: { userId: owner.id, name: "Passed result", examDate: exam, grade: 2, passed: true } });
    assert.equal((await request("actions/setPassed", token, { courseId: result.id, passed: "0" })).status, 200);
    assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: result.id } })).grade, 2);
    assert.equal((await request("actions/setPassed", token, { courseId: result.id, passed: "0", clearPassingGrade: "1" })).status, 200);
    const saved = await prisma.course.findUniqueOrThrow({ where: { id: result.id } });
    assert.equal(saved.grade, null); assert.equal(saved.passed, false);
    const exams = await (await request("exams", token)).json();
    assert.ok(exams.courses.some((item: { id: string }) => item.id === result.id));
    assert.ok(!exams.results.some((item: { id: string }) => item.id === result.id));
    assert.equal((await request("actions/setPassed", token, { courseId: privateCourse.id, passed: "0", clearPassingGrade: "1" })).status, 404);
    assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: privateCourse.id } })).grade, 1);
    await prisma.course.delete({ where: { id: result.id } });
  });
  await check("paused session swipes defer resuming and completion preserves notes without leaving a paused task", async () => {
    const paused = await prisma.course.create({ data: { userId: owner.id, name: "Paused work", examDate: exam, topics: { create: { title: "Resume me", studyProgress: JSON.stringify({ version: 1, response: "Keep these notes", elapsedSeconds: 120, sessionMinutes: 30, updatedAt: new Date().toISOString() }) } } }, include: { topics: true } });
    const block = await prisma.studyBlock.create({ data: { courseId: paused.id, topicId: paused.topics[0].id, topicTitle: "Resume me", date: new Date(Date.parse(today) + 3 * 86400_000), minutes: 30 } });
    assert.equal((await request("actions/moveBlock", token, { blockId: block.id })).status, 200);
    let current = await (await request("today", token)).json();
    assert.ok(!current.blocks.some((item: { id: string }) => item.id === block.id));
    assert.notEqual(current.resumeBlock?.id, block.id);
    const progress = JSON.parse((await prisma.topic.findUniqueOrThrow({ where: { id: block.topicId } })).studyProgress!);
    assert.equal(progress.response, "Keep these notes"); assert.equal(progress.elapsedSeconds, 120);
    assert.equal(progress.resumeAfter, new Date(Date.parse(today) + 86400_000).toISOString().slice(0, 10));
    assert.equal((await prisma.studyBlock.findUniqueOrThrow({ where: { id: block.id } })).date.toISOString().slice(0, 10), progress.resumeAfter);
    await mobileSaveProgress(owner.id, block.id, { topicId: block.topicId, response: "Old autosave", elapsedSeconds: 60, updatedAt: new Date(Date.parse(progress.updatedAt) - 1).toISOString() });
    assert.deepEqual(JSON.parse((await prisma.topic.findUniqueOrThrow({ where: { id: block.topicId } })).studyProgress!), progress, "a late old checkpoint cannot undo the deferral or overwrite notes");
    assert.equal((await request("actions/toggleBlock", token, { blockId: block.id, done: "true" })).status, 200);
    assert.equal((await prisma.topic.findUniqueOrThrow({ where: { id: block.topicId } })).studyProgress, null);
    assert.equal((await prisma.focusNote.findFirstOrThrow({ where: { topicId: block.topicId } })).body, "Keep these notes");
    assert.equal((await request("actions/toggleBlock", token, { blockId: block.id, done: "true" })).status, 200);
    assert.equal(await prisma.focusNote.count({ where: { topicId: block.topicId } }), 1);
    current = await (await request("today", token)).json(); assert.notEqual(current.resumeBlock?.id, block.id);
    await prisma.course.delete({ where: { id: paused.id } });
  });
  await check("calendar and timetable reads remain scoped to the mobile account", async () => {
    await prisma.lecture.create({ data: { userId: other.id, title: "Private class", weekday: 1, startMin: 540, endMin: 600 } });
    const data = await (await request(`calendar?week=${today}`, token)).json(); assert.equal(data.days.length, 7); assert.equal(data.lectures.length, 0); assert.ok(data.blocks.every((b: { course: { id: string } }) => b.course.id === course.id));
  });
  await check("foreign mutation ids fail before invoking web actions", async () => {
    const response = await request("actions/saveGrade", token, { courseId: privateCourse.id, grade: "5.0", userId: other.id });
    assert.equal(response.status, 404); assert.equal((await prisma.course.findUniqueOrThrow({ where: { id: privateCourse.id } })).grade, 1);
    assert.equal((await request("actions/saveNote", token, { topicId: privateCourse.topics[0].id, body: "overwrite" })).status, 404);
  });
  await check("unknown actions and malformed fields are rejected", async () => {
    assert.equal((await request("actions/constructor", token, {})).status, 404);
    assert.equal((await request("actions/saveGrade", token, { grade: "1" })).status, 400);
    assert.throws(() => mobileForm({ grade: 2 })); assert.throws(() => mobileForm({ ids: Array(501).fill("id") }));
  });
  await check("request identity is isolated across concurrent actions and cleared afterwards", async () => {
    assert.equal(authenticatedMobileUser(), undefined);
    const users = await Promise.all([owner.id, other.id].map(id => withAuthenticatedMobileUser(id, async () => {
      await new Promise(resolve => setTimeout(resolve, 5)); return getCurrentUserId();
    })));
    assert.deepEqual(users, [owner.id, other.id]); assert.equal(authenticatedMobileUser(), undefined);
    await assert.rejects(withAuthenticatedMobileUser(owner.id, async () => { throw new Error("failed action"); }));
    assert.equal(authenticatedMobileUser(), undefined);
  });
  await check("web and native recall use the same answer keys, order and owned originals", async () => {
    const task = quickStudyTask("recall", 15, "en", { sourceFileId: file.id, sourceRef: "Notes" });
    task.checkQuestion = "What is a vector?"; task.answerKey = "An element of a vector space.";
    await prisma.topic.update({ where: { id: course.topics[0].id }, data: { studyTask: JSON.stringify(task), questions: JSON.stringify([null, "", "How do vectors add?"]) } });
    const response = await request(`practice?courseId=${course.id}`, token); assert.equal(response.status, 200);
    const native = await response.json();
    const web = await practiceForUser(owner.id, course.id); assert.ok(web);
    assert.deepEqual(native, web);
    assert.equal(native.cards[0].question, task.checkQuestion); assert.equal(native.cards[0].answerKey, task.answerKey);
    assert.equal(native.cards[0].sourceFileId, file.id); assert.equal(native.cards[1].question, "How do vectors add?");
    assert.equal((await request(`practice?courseId=${privateCourse.id}`, token)).status, 404);
  });
  await check("native past-paper practice matches topics and never reads another course's file", async () => {
    const paper = await prisma.moduleFile.create({ data: { courseId: course.id, filename: "Past paper.txt", content: Buffer.from("Past paper"), analysis: JSON.stringify({ examQuestions: [null, { question: "State a vector property", topic: "Vectors" }, { question: "Describe a matrix", topic: "Matrices" }] }) } });
    const native = await (await request(`practice?courseId=${course.id}&examFile=${paper.id}`, token)).json();
    assert.equal(native.cards.length, 2); assert.equal(native.courseName, "Past paper.txt");
    assert.equal(native.cards[0].topicId, course.topics[0].id); assert.equal(native.cards[1].topicId, course.topics[1].id);
    assert.equal(native.cards[0].sourceFileId, paper.id);
    const foreign = await prisma.moduleFile.create({ data: { courseId: privateCourse.id, filename: "Secret exam", analysis: JSON.stringify({ examQuestions: [{ question: "Private question", topic: "Private topic" }] }) } });
    const result = await (await request(`practice?courseId=${course.id}&examFile=${foreign.id}`, token)).json();
    assert.deepEqual(result.cards, []); assert.equal(JSON.stringify(result).includes("Private question"), false);
    const detail = await (await request(`courses/${course.id}`, token)).json();
    assert.equal(detail.files.find((f: { id: string }) => f.id === paper.id).mockExamQuestions, 2);
  });
  await check("native upload batches continue after a failed original and retry only failures", async () => {
    const originals = [{ name: "one.pdf" }, { name: "two.pdf" }, { name: "three.pdf" }];
    const sent: string[] = []; const progress: number[] = []; let active = 0;
    const first = await uploadBatch(originals, async original => {
      assert.equal(++active, 1, "uploads stay sequential"); await Promise.resolve(); sent.push(original.name); active--;
      if (original.name === "two.pdf") throw new Error("Connection lost");
    }, current => progress.push(current));
    assert.equal(first.saved, 2); assert.deepEqual(sent, originals.map(item => item.name)); assert.deepEqual(progress, [1, 2, 3]);
    const retry = await uploadBatch(first.failed.map(failure => failure.item), async original => { sent.push(original.name); }, () => {});
    assert.equal(retry.saved, 1); assert.deepEqual(retry.failed, []); assert.deepEqual(sent, ["one.pdf", "two.pdf", "three.pdf", "two.pdf"]);
  });
  console.log(`\n${passed} native workspace checks passed`);
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
