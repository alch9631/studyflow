import assert from "node:assert/strict";
import { api, ApiError, getFocus, getToday, finishFocus, finishSession, saveProgress, serverUrl } from "../../apps/mobile/src/api";
import { DemoError, DemoWorkspace, startDemoSession, endDemoSession, DEMO_SERVER } from "../../apps/mobile/src/demo";
import { shiftDay } from "../../apps/mobile/src/demo-data";
import type { MobileBlock, MobileFocusNote, MobileToday } from "../../shared/mobile";
import type { ActionResult, CalendarData, CourseDetail, CourseSummary, ExamData, FormFields, InsightsData, PracticeData, PreferencesData } from "../../shared/mobileWorkspace";
import { compactSessionLabel } from "../../apps/mobile/src/session-label";

let passed = 0;
async function check(name: string, run: () => void | Promise<void>) { await run(); console.log(`  ✓ ${name}`); passed++; }
async function main() {
  const demo = new DemoWorkspace("2026-11-02");
  const read = <T,>(path: string) => demo.request(path) as T;
  const action = <T = ActionResult,>(name: string, fields: FormFields = {}) => demo.request(`actions/${name}`, { method: "POST", body: { fields } }) as T;
  await check("compact session labels separate activity and page references without altering topic names", () => {
    assert.deepEqual(compactSessionLabel("Read: 2.2 Condition of a problem and stability of an algorithm · PDF p. 10"), {
      title: "2.2 Condition of a problem and stability of an algorithm", activity: "Read", reference: "PDF p. 10",
    });
    assert.deepEqual(compactSessionLabel("Recall: Matrices · PDF pp. 10–12"), { title: "Matrices", activity: "Recall", reference: "PDF pp. 10–12" });
    assert.deepEqual(compactSessionLabel("Design: APIs · trade-offs", "review"), { title: "Design: APIs · trade-offs", activity: "Review", reference: "" });
    assert.equal(compactSessionLabel("Recall:").title, "Recall:", "a short title cannot become empty");
  });
  await check("sample data loads every workspace screen without an account", () => {
    const today = read<MobileToday>("today"); assert.equal(today.blocks.length, 3); assert.ok(today.blocks.some(block => !block.completed));
    assert.equal(read<CourseSummary[]>("courses").length, 3);
    const course = read<CourseDetail>("courses/demo-maths"); assert.equal(course.topics.length, 2);
    assert.equal(read<CalendarData>("calendar").days.length, 7);
    assert.equal(read<ExamData>("exams").courses.length, 2);
    assert.equal(read<PreferencesData>("preferences").user.name, "Alex Demo");
    assert.equal(read<InsightsData>("insights").grades.lpEarned, 6);
    assert.equal(read<PracticeData>("practice?courseId=demo-maths").cards.length, 2);
    assert.ok(read<MobileBlock>("blocks/demo-study").task?.sourceExcerpt);
  });
  await check("demo course edits, topic coverage and deadline changes affect only the sample workspace", () => {
    const created = action("createCourse", { name: "My demo course", examDate: "2026-12-01", topics: "First topic\nSecond topic", difficulty: "3", dailyBudgetMin: "60", studyDays: ["1", "3", "5"] });
    const id = created.redirect!.split("/").pop()!;
    const course = read<CourseDetail>(`courses/${id}`); assert.equal(course.topics.length, 2);
    action("toggleTopic", { courseId: id, topicId: course.topics[0].id, done: "true" });
    assert.equal(read<CourseSummary[]>("courses").find(item => item.id === id)!.topicsDone, 1);
    action("toggleTopic", { courseId: id, topicId: course.topics[0].id, done: "false" });
    assert.ok(action("startFocus", { courseId: id, topicId: course.topics[0].id }).blockId);
    action("addAssignment", { courseId: id, title: "Demo hand-in", dueDate: "2026-11-09" });
    const deadline = read<CourseDetail>(`courses/${id}`).assignments[0];
    action("deleteAssignment", { courseId: id, assignmentId: deadline.id });
    assert.equal(read<CourseDetail>(`courses/${id}`).assignments.length, 0);
    assert.throws(() => action("updateCourse", { courseId: id, examDate: "2026-12-15", difficulty: "99" }), DemoError);
    assert.equal(read<CourseDetail>(`courses/${id}`).examDate, "2026-12-01", "a failed form does not partially change the date");
    action("deleteCourse", { courseId: id }); assert.throws(() => read(`courses/${id}`), DemoError);
    assert.ok(read<CalendarData>("calendar").blocks.every(block => block.course.id !== id));
    const empty = action("createCourse", { name: "A course without topics yet", examDate: "2026-12-01", dailyBudgetMin: "60" });
    const emptyId = empty.redirect!.split("/").pop()!;
    assert.ok(action("startFocus", { courseId: emptyId }).blockId, "even a new course without material can start a timer");
    action("deleteCourse", { courseId: emptyId });
  });
  await check("course study entry resumes saved work, respects dates and rejects covered or foreign topics", () => {
    const workspace = new DemoWorkspace("2026-11-02");
    const change = (name: string, fields: FormFields) => workspace.request(`actions/${name}`, { method: "POST", body: { fields } }) as ActionResult;
    assert.equal(change("startFocus", { courseId: "demo-algorithms" }).blockId, "demo-missed", "study follows the earliest unfinished sitting");
    workspace.request("blocks/demo-study/progress", { method: "PUT", body: { topicId: "demo-matrices", response: "Resume this draft", elapsedSeconds: 120, sessionMinutes: 30, updatedAt: "2026-11-02T12:00:00.000Z" } });
    assert.equal(change("startFocus", { courseId: "demo-maths" }).blockId, "demo-study", "saved work takes priority over the first topic");
    assert.equal(change("startFocus", { courseId: "demo-maths" }).blockId, "demo-study", "repeated starts reuse the same sitting");
    change("toggleTopic", { courseId: "demo-maths", topicId: "demo-matrices", done: "true" });
    assert.throws(() => change("startFocus", { courseId: "demo-maths", topicId: "demo-matrices" }), DemoError);
    assert.throws(() => change("startFocus", { courseId: "demo-maths", topicId: "demo-search" }), DemoError);
  });
  await check("demo notes support idempotent save and reject a stale edit without losing the newer text", () => {
    const fields = { topicId: "demo-matrices", id: "demo-new-note", body: "My working note" };
    const first = action<{ note: MobileFocusNote }>("addFocusNote", fields).note;
    action("addFocusNote", fields);
    assert.equal(read<MobileBlock>("blocks/demo-study").notes!.filter(note => note.id === first.id).length, 1);
    action("updateFocusNote", { ...fields, body: "Edited note", updatedAt: first.updatedAt });
    assert.throws(() => action("updateFocusNote", { ...fields, body: "Stale overwrite", updatedAt: first.updatedAt }), DemoError);
    assert.equal(read<MobileBlock>("blocks/demo-study").notes!.find(note => note.id === first.id)!.body, "Edited note");
  });
  await check("exam module notes reload across remaining and results while stale edits and clears stay protected", () => {
    const workspace = new DemoWorkspace("2026-11-02");
    const change = (name: string, fields: FormFields) => workspace.request(`actions/${name}`, { method: "POST", body: { fields } });
    const save = (body: string, updatedAt = "") => change("saveExamNote", { courseId: "demo-maths", body, updatedAt }) as { note: { body: string; updatedAt: string } };
    const course = () => (workspace.request("exams") as ExamData).allCourses.find(item => item.id === "demo-maths")!;
    const before = course();
    assert.equal(before.examNote, ""); assert.equal(before.examNoteUpdatedAt, null);
    const first = save("  Bring calculator  ").note;
    assert.equal(first.body, "Bring calculator"); assert.equal(course().examNote, first.body); assert.equal(course().examNoteUpdatedAt, first.updatedAt);
    const edited = save("Bring calculator and ID", first.updatedAt).note;
    assert.ok(edited.updatedAt > first.updatedAt, "rapid saves advance the note version");
    assert.throws(() => save("Stale edit", first.updatedAt), /This note changed/);
    assert.equal(course().examNote, edited.body);
    change("setPassed", { courseId: "demo-maths", passed: "1" });
    assert.equal((workspace.request("exams") as ExamData).results.find(item => item.id === "demo-maths")!.examNote, edited.body);
    const cleared = save("  ", edited.updatedAt).note;
    assert.equal(cleared.body, ""); assert.ok(cleared.updatedAt > edited.updatedAt);
    assert.equal(course().examNoteUpdatedAt, cleared.updatedAt, "clearing a note keeps its concurrency version");
    assert.throws(() => save("Stale restore", edited.updatedAt), /This note changed/);
    assert.throws(() => save("x".repeat(4001), cleared.updatedAt), DemoError);
    assert.equal(course().examNote, ""); assert.equal(course().examDate, before.examDate); assert.equal(course().grade, before.grade);
    assert.equal((workspace.request("courses/demo-maths") as CourseDetail).topics[0].note, "A linear combination scales vectors and adds the results.");
  });
  await check("exam notes reject missing courses and stay isolated between demo workspaces", () => {
    const workspace = new DemoWorkspace("2026-11-02");
    assert.throws(() => workspace.request("actions/saveExamNote", { method: "POST", body: { fields: { courseId: "foreign-course", body: "Private note", updatedAt: "" } } }), (error: unknown) => error instanceof DemoError && error.status === 404);
    workspace.request("actions/saveExamNote", { method: "POST", body: { fields: { courseId: "demo-maths", body: "This demo only", updatedAt: "" } } });
    const other = new DemoWorkspace("2026-11-02");
    assert.equal((other.request("exams") as ExamData).allCourses.find(item => item.id === "demo-maths")!.examNote, "");
  });
  await check("demo recovery can be previewed and undone while completed sessions stay intact", () => {
    const before = read<CalendarData>("calendar").blocks;
    assert.ok(read<MobileToday>("today").planHealth!.overdueSessions);
    action("recoverPlan"); assert.equal(read<MobileToday>("today").planHealth!.undoAvailable, true);
    assert.equal(read<MobileBlock>("blocks/demo-done").completed, true);
    action("undoRecovery"); assert.deepEqual(read<CalendarData>("calendar").blocks, before);
    action("moveBlock", { blockId: "demo-study" });
    assert.ok(read<CalendarData>("calendar").blocks.some(block => block.id === "demo-study" && block.date === "2026-11-03"));
  });
  await check("Calendar completion can be toggled repeatedly without losing its assigned time or notes", () => {
    const workspace = new DemoWorkspace("2026-11-02");
    const change = (name: string, fields: FormFields) => workspace.request(`actions/${name}`, { method: "POST", body: { fields } });
    change("updateBlockTime", { blockId: "demo-study", date: "2026-11-02", startHHmm: "10:00", endHHmm: "10:30" });
    change("saveBlockNote", { blockId: "demo-study", body: "Keep this note" });
    for (const done of [true, false, true, false]) {
      change("toggleBlock", { blockId: "demo-study", done: String(done) });
      const calendar = workspace.request("calendar") as CalendarData;
      const block = calendar.blocks.find(item => item.id === "demo-study")!;
      assert.equal(block.completed, done); assert.equal(block.start, 600); assert.equal(block.end, 630);
      assert.equal((workspace.request("blocks/demo-study") as MobileBlock).note, "Keep this note");
    }
  });
  await check("paused demo sessions stay deferred after a move and completion keeps their working notes", () => {
    const workspace = new DemoWorkspace("2026-11-02");
    const change = (name: string, fields: FormFields) => workspace.request(`actions/${name}`, { method: "POST", body: { fields } });
    const progress = { topicId: "demo-matrices", response: "Keep my paused notes", elapsedSeconds: 90, sessionMinutes: 30, updatedAt: "2026-11-02T12:00:00.000Z" };
    workspace.request("blocks/demo-study/progress", { method: "PUT", body: progress });
    change("moveBlock", { blockId: "demo-study" });
    let today = workspace.request("today") as MobileToday;
    assert.equal(today.resumeBlock, null); assert.ok(!today.blocks.some(block => block.id === "demo-study"));
    const moved = workspace.request("blocks/demo-study") as MobileBlock;
    assert.equal(moved.progress!.response, progress.response); assert.equal(moved.progress!.elapsedSeconds, 90);
    change("toggleBlock", { blockId: "demo-study", done: "true" });
    const completed = workspace.request("blocks/demo-study") as MobileBlock;
    assert.equal(completed.progress, null); assert.ok(completed.notes!.some(note => note.body === progress.response));
    change("toggleBlock", { blockId: "demo-study", done: "true" });
    assert.equal((workspace.request("blocks/demo-study") as MobileBlock).notes!.filter(note => note.body === progress.response).length, 1);
    today = workspace.request("today") as MobileToday; assert.equal(today.resumeBlock, null);
  });
  await check("unmarking a graded or ungraded demo pass returns it to remaining exams", () => {
    const workspace = new DemoWorkspace("2026-11-02");
    const change = (fields: FormFields) => workspace.request("actions/setPassed", { method: "POST", body: { fields } });
    change({ courseId: "demo-programming", passed: "0", clearPassingGrade: "1" });
    let exams = workspace.request("exams") as ExamData;
    assert.ok(exams.courses.some(course => course.id === "demo-programming"));
    assert.equal(exams.allCourses.find(course => course.id === "demo-programming")!.grade, null);
    change({ courseId: "demo-maths", passed: "1" });
    change({ courseId: "demo-maths", passed: "0", clearPassingGrade: "1" });
    exams = workspace.request("exams") as ExamData;
    assert.ok(exams.courses.some(course => course.id === "demo-maths"));
    assert.equal(exams.results.some(course => course.id === "demo-maths"), false);
  });
  await check("demo grades, recall ratings and preferences update the screens that display them", () => {
    action("setConfidence", { topicId: "demo-vectors", confidence: "solid" });
    assert.equal(read<PracticeData>("practice?courseId=demo-maths").cards[0].confidence, "solid");
    action("saveGrade", { courseId: "demo-maths", grade: "1.7" });
    assert.equal(read<ExamData>("exams").courses.length, 1);
    action("setPassed", { courseId: "demo-maths", passed: "1" });
    action("saveGrade", { courseId: "demo-maths", grade: "" });
    assert.equal(read<CourseDetail>("courses/demo-maths").passed, true, "clearing a grade keeps a manual pass");
    action("setPassed", { courseId: "demo-maths", passed: "0" });
    assert.ok(read<CourseSummary[]>("courses").find(course => course.id === "demo-maths")!.remainingMinutes > 0, "removing a pass brings unfinished demo study back");
    action("savePreferences", { dayStart: "10:00", dayEnd: "17:00", dailyBudgetMin: "75", energy: "evening" });
    assert.equal(read<PreferencesData>("preferences").preferences.dailyBudgetMin, 75);
    assert.throws(() => action("savePreferences", { dayStart: "17:00", dayEnd: "10:00", dailyBudgetMin: "90", energy: "morning" }), DemoError);
    assert.equal(read<PreferencesData>("preferences").preferences.dayStartMin, 600);
    assert.throws(() => action("prepareMaterial", { fileId: "real-file" }), DemoError);
  });
  await check("arranging a selected demo day preserves manual times, other days and completed work", () => {
    const calendar = new DemoWorkspace("2026-11-02");
    const change = (name: string, fields: FormFields) => calendar.request(`actions/${name}`, { method: "POST", body: { fields } });
    const blocks = () => (calendar.request("calendar") as CalendarData).blocks;
    change("updateBlockTime", { blockId: "demo-study", date: "2026-11-02", startHHmm: "11:00", endHHmm: "11:30" });
    const before = blocks();
    const result = change("autoSchedule", { weekStart: "2026-11-02", day: "2026-11-02" }) as { placed: number; unplaced: number };
    assert.deepEqual(result, { ok: true, placed: 1, unplaced: 0 });
    for (const id of ["demo-study", "demo-tomorrow", "demo-done"]) assert.deepEqual(blocks().find(block => block.id === id), before.find(block => block.id === id));
    const placed = blocks().find(block => block.id === "demo-review")!;
    assert.ok(placed.start! >= 630, "the recurring lecture stays free");
    assert.ok(placed.end! <= 660 || placed.start! >= 690, "manual times stay free");
    assert.deepEqual(change("autoSchedule", { weekStart: "2026-11-02", day: "2026-11-02" }), { ok: true, placed: 0, unplaced: 0 });
    change("savePreferences", { dayStart: "09:00", dayEnd: "09:15", dailyBudgetMin: "30", energy: "morning" });
    assert.deepEqual(change("autoSchedule", { weekStart: "2026-11-02", day: "2026-11-03" }), { ok: true, placed: 0, unplaced: 1 });
    assert.equal(blocks().find(block => block.id === "demo-tomorrow")!.start, null, "a full window leaves work unscheduled");
  });
  await check("resetting the demo restores sample data and returned objects cannot mutate it", () => {
    const fresh = new DemoWorkspace("2026-11-02");
    const courses = fresh.request("courses") as CourseSummary[];
    courses[0].name = "External mutation";
    assert.equal((fresh.request("courses") as CourseSummary[])[0].name, "Linear Algebra");
    assert.equal((fresh.request("exams") as ExamData).courses.length, 2);
    assert.throws(() => fresh.request("courses/real-account-course"), DemoError);
  });

  const originalFetch = globalThis.fetch; let networkRequests = 0;
  globalThis.fetch = async () => { networkRequests++; return Response.json({ error: { message: "Not authenticated" } }, { status: 401 }); };
  const session = startDemoSession();
  try {
    await check("the real mobile API routes demo reads and writes locally, with zero network requests", async () => {
      const today = await getToday(session.server, session.token);
      assert.ok(today.blocks.length);
      const block = await getFocus(session.server, session.token, "demo-study");
      await saveProgress(session.server, session.token, block.id, { topicId: block.topicId, response: "A demo draft", elapsedSeconds: 120, sessionMinutes: 60, updatedAt: "2026-11-02T10:00:00.000Z" });
      await saveProgress(session.server, session.token, block.id, { topicId: block.topicId, response: "Stale draft", elapsedSeconds: 30, updatedAt: "2026-11-02T09:00:00.000Z" });
      const resumed = await getFocus(session.server, session.token, block.id);
      assert.equal(resumed.progress!.response, "A demo draft"); assert.equal(resumed.progress!.sessionMinutes, 60);
      const result = { topicId: block.topicId, response: "Five minutes studied", elapsedSeconds: 300, kind: block.kind };
      await finishFocus(session.server, session.token, block.id, result);
      await finishFocus(session.server, session.token, block.id, { ...result, elapsedSeconds: 900 });
      const finished = await getFocus(session.server, session.token, block.id);
      assert.equal(finished.completed, true); assert.equal(finished.minutes, 5);
      const course = await api<CourseDetail>(session.server, session.token, "courses/demo-maths");
      assert.equal(course.topics.find(topic => topic.id === block.topicId)!.done, false);
      const week = await api<CalendarData>(session.server, session.token, `calendar?week=${shiftDay(today.date, 1)}`);
      assert.ok(week.blocks.some(item => item.topicId === block.topicId && !item.completed && item.minutes === 25));
      assert.equal(networkRequests, 0);
    });
    await check("demo goal checks require an answer and finishing a session invalidates undo", async () => {
      await api(session.server, session.token, "actions/protectToday", { method: "POST", body: { fields: {} } });
      const block = await getFocus(session.server, session.token, "demo-review");
      await assert.rejects(finishSession(session.server, session.token, block.id, { topicId: block.topicId, response: "", actualMinutes: 2, checked: true, outcome: "complete" }), (error: unknown) => error instanceof ApiError && error.status === 400);
      await finishSession(session.server, session.token, block.id, { topicId: block.topicId, response: "(2, 3)", actualMinutes: 2, checked: true, outcome: "complete" });
      assert.equal((await getToday(session.server, session.token)).planHealth!.undoAvailable, false);
      assert.equal((await api<CourseDetail>(session.server, session.token, "courses/demo-maths")).topics[0].done, true);
      assert.equal(networkRequests, 0);
    });
    await check("demo credentials expire on exit and cannot bypass real-server authentication", async () => {
      assert.throws(() => serverUrl(DEMO_SERVER, true), "demo addresses cannot be configured as a real server");
      assert.equal(/^[A-Za-z0-9_-]{43}$/.test(session.token), false, "demo credentials cannot pass the real bearer-token format check");
      endDemoSession(session.token);
      const next = startDemoSession(); assert.notEqual(next.userId, session.userId, "demo drafts have a fresh namespace each time");
      await assert.rejects(getToday(DEMO_SERVER, session.token), (error: unknown) => error instanceof ApiError && error.status === 401);
      assert.equal(networkRequests, 0, "an old demo session never falls through to fetch");
      await assert.rejects(getToday("https://studyflow.example", next.token), (error: unknown) => error instanceof ApiError && error.status === 401);
      assert.equal(networkRequests, 1, "a demo token is not treated as authenticated against a real backend");
      assert.equal((await getToday(next.server, next.token)).blocks.length, 3);
      endDemoSession(next.token);
    });
  } finally { globalThis.fetch = originalFetch; endDemoSession(session.token); }
  console.log(`\n${passed} mobile demo checks passed`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
