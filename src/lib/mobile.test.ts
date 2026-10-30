import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { ApiError } from "./apiError";
import { createMobileGrant, exchangeMobileGrant, mobileCallback, mobileHash, mobileIdentity } from "./mobileAuth";
import { GET, POST, PUT, DELETE } from "../app/api/mobile/[...path]/route";
import { todayISO } from "./planService";
import { quickStudyTask } from "./studyTask";
import { elapsedAt } from "../../shared/mobile";

let passed = 0;
async function check(name: string, run: () => unknown | Promise<unknown>) {
  await run(); passed++; console.log(`  ✓ ${name}`);
}

const verifier = "a".repeat(64);
function call(method: string, path: string, token?: string, input?: unknown) {
  const request = new Request(`http://localhost/api/mobile/${path}`, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(input === undefined ? {} : { "Content-Type": "application/json" }) },
    body: input === undefined ? undefined : JSON.stringify(input) });
  const handler = { GET, POST, PUT, DELETE }[method as "GET" | "POST" | "PUT" | "DELETE"];
  return handler(request, { params: Promise.resolve({ path: path.split("/") }) });
}

async function main() {
  const owner = await prisma.user.create({ data: { email: "mobile-owner@example.test", name: "Native Student" } });
  const other = await prisma.user.create({ data: { email: "mobile-other@example.test" } });
  const date = new Date(`${todayISO()}T00:00:00Z`);
  const exam = new Date(date.getTime() + 30 * 86400_000);
  async function course(userId: string, name: string) {
    return prisma.course.create({ data: { userId, name, examDate: exam, topics: { create: { title: "A native study session", effort: 1, order: 0 } } }, include: { topics: true } });
  }
  const ownCourse = await course(owner.id, "Mobile algorithms");
  const foreignCourse = await course(other.id, "Private other course");
  const block = await prisma.studyBlock.create({ data: { courseId: ownCourse.id, topicId: ownCourse.topics[0].id, date, topicTitle: "A native study session", minutes: 25, kind: "study" } });
  const foreign = await prisma.studyBlock.create({ data: { courseId: foreignCourse.id, topicId: foreignCourse.topics[0].id, date, topicTitle: "Private other session", minutes: 25, kind: "study" } });
  const code = await createMobileGrant(owner.id, mobileHash(verifier));
  await check("wrong PKCE verifier cannot exchange or consume a grant", async () => {
    await assert.rejects(exchangeMobileGrant(code, "b".repeat(64)), (e: unknown) => e instanceof ApiError && e.status === 401);
  });
  const session = await exchangeMobileGrant(code, verifier);
  await check("one-use grant creates a hashed, expiring bearer session", async () => {
    assert.equal(session.userId, owner.id);
    assert.ok(new Date(session.expiresAt).getTime() > Date.now());
    assert.equal(await prisma.session.count({ where: { sessionToken: session.token } }), 0);
    assert.equal(await prisma.session.count({ where: { sessionToken: `mobile:${mobileHash(session.token)}` } }), 1);
    await assert.rejects(exchangeMobileGrant(code, verifier));
  });
  await check("mobile endpoints require bearer authentication even in development", async () => {
    const response = await call("GET", "today");
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("Location"), null);
    assert.match(response.headers.get("Cache-Control")!, /no-store/);
  });
  await check("Today returns owned data and consistent totals", async () => {
    const response = await call("GET", "today", session.token);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.blocks.length, 1);
    assert.equal(body.blocks[0].course.id, ownCourse.id);
    assert.equal(body.summary.plannedMinutes, 25);
    assert.equal(body.nextExam.name, ownCourse.name);
  });
  await check("guessed block and material IDs never expose another user's data", async () => {
    assert.equal((await call("GET", `blocks/${foreign.id}`, session.token)).status, 404);
    assert.equal((await call("GET", "materials/unknown", session.token)).status, 404);
    assert.equal((await call("PUT", `blocks/${foreign.id}/progress`, session.token, { topicId: foreign.topicId, response: "steal", elapsedSeconds: 1, updatedAt: new Date().toISOString() })).status, 404);
  });
  await check("checkpoint saves the answer and time on the stable topic", async () => {
    const response = await call("PUT", `blocks/${block.id}/progress`, session.token, { topicId: block.topicId, response: "My answer", elapsedSeconds: 80, updatedAt: new Date().toISOString() });
    assert.equal(response.status, 200);
    const focus = await (await call("GET", `blocks/${block.id}`, session.token)).json();
    assert.equal(focus.progress.response, "My answer");
    assert.equal(focus.progress.elapsedSeconds, 80);
  });
  await check("invalid checkpoints and oversized payloads do not write data", async () => {
    assert.equal((await call("PUT", `blocks/${block.id}/progress`, session.token, { topicId: block.topicId, response: "", elapsedSeconds: -1, updatedAt: new Date().toISOString() })).status, 400);
    assert.equal((await call("POST", "session", undefined, { padding: "a".repeat(33000) })).status, 400);
    const malformed = new Request("http://localhost/api/mobile/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
    assert.equal((await POST(malformed, { params: Promise.resolve({ path: ["session"] }) })).status, 400);
  });
  await check("ordinary session completion is explicit and idempotent", async () => {
    const input = { topicId: block.topicId, response: "My answer", actualMinutes: 12, checked: false, outcome: "complete" };
    assert.equal((await call("POST", `blocks/${block.id}/result`, session.token, input)).status, 400);
    input.checked = true;
    assert.equal((await call("POST", `blocks/${block.id}/result`, session.token, input)).status, 200);
    input.actualMinutes = 99;
    assert.equal((await call("POST", `blocks/${block.id}/result`, session.token, input)).status, 200);
    const saved = await prisma.studyBlock.findUniqueOrThrow({ where: { id: block.id } });
    assert.equal(saved.completed, true);
    assert.equal(saved.actualMinutes, 12);
    assert.equal((await prisma.note.findUniqueOrThrow({ where: { topicId: block.topicId } })).body, "My answer");
  });
  await check("source-backed task completion uses the existing checked-result service", async () => {
    const task = quickStudyTask("recall", 15, "en", { sourceRef: "My notes" });
    task.checkQuestion = "What is a queue?"; task.answerKey = "A FIFO structure.";
    const topic = await prisma.topic.create({ data: { courseId: ownCourse.id, title: "Queues", effort: 1, order: 1, studyTask: JSON.stringify(task) } });
    const taskBlock = await prisma.studyBlock.create({ data: { courseId: ownCourse.id, topicId: topic.id, date, topicTitle: topic.title, minutes: 15, kind: "study" } });
    const input = { topicId: topic.id, response: "", actualMinutes: 10, checked: true, outcome: "complete" };
    assert.equal((await call("POST", `blocks/${taskBlock.id}/result`, session.token, input)).status, 400);
    input.response = "A FIFO structure.";
    assert.equal((await call("POST", `blocks/${taskBlock.id}/result`, session.token, input)).status, 200);
    assert.equal((await call("POST", `blocks/${taskBlock.id}/result`, session.token, input)).status, 200);
    assert.equal((await prisma.topic.findUniqueOrThrow({ where: { id: topic.id } })).done, true);
  });
  await check("callback validation blocks arbitrary schemes and production Expo links", () => {
    assert.equal(mobileCallback("studyflow://auth/callback"), "studyflow://auth/callback");
    assert.throws(() => mobileCallback("https://attacker.example/callback"));
    assert.throws(() => mobileCallback("studyflow://auth/callback?evil=1"));
  });
  await check("production disables development login regardless of ALLOW_DEV_USER", async () => {
    const old = process.env.NODE_ENV;
    const allowed = process.env.ALLOW_DEV_USER;
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.ALLOW_DEV_USER = "1";
    try {
      assert.equal((await call("POST", "session", undefined, { development: true })).status, 401);
      assert.throws(() => mobileCallback("exp://192.168.1.2:8081/--/auth/callback"));
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = old;
      if (allowed === undefined) delete process.env.ALLOW_DEV_USER; else process.env.ALLOW_DEV_USER = allowed;
    }
  });
  await check("expiry and revocation reject old tokens", async () => {
    const expiring = await exchangeMobileGrant(await createMobileGrant(owner.id, mobileHash(verifier)), verifier);
    await prisma.session.updateMany({ where: { sessionToken: `mobile:${mobileHash(expiring.token)}` }, data: { expires: new Date(0) } });
    await assert.rejects(mobileIdentity(new Request("http://localhost", { headers: { Authorization: `Bearer ${expiring.token}` } })));
    assert.equal((await call("DELETE", "session", session.token)).status, 200);
    assert.equal((await call("GET", "today", session.token)).status, 401);
  });
  await check("timer credits background wall-clock time, pauses, and caps long sessions", () => {
    assert.equal(elapsedAt(30, 1000, 121000), 150);
    assert.equal(elapsedAt(30, null, 121000), 30);
    assert.equal(elapsedAt(30, 121000, 1000), 30);
    assert.equal(elapsedAt(0, 0, 99_000_000), 36000);
  });
  console.log(`\n${passed} mobile checks passed`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
