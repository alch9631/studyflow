import type { MobileBlock, MobileFocusNote, MobileSession, MobileToday } from "../../../shared/mobile";
import type { CalendarData, CourseDetail, CourseSummary, ExamData, FormFields, InsightsData, PracticeCard, PracticeData } from "../../../shared/mobileWorkspace";
import { copyDemo, createDemoState, DEMO_SERVER, shiftDay, type DemoBlock, type DemoState } from "./demo-data";

export { DEMO_SERVER } from "./demo-data";
export class DemoError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
type Options = { method?: string; body?: unknown };
type Topic = CourseDetail["topics"][number];
const passed = (course: CourseDetail) => course.passed || course.grade !== null && course.grade <= 4;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const day = (value: string) => {
  if (!dayPattern.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new DemoError("Choose a valid date.");
  return value;
};
const time = (value: string) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new DemoError("Use a time in HH:MM format.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
};
const number = (value: string | number, minimum: number, maximum: number) => {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || result > maximum) throw new DemoError(`Choose a value between ${minimum} and ${maximum}.`);
  return result;
};

/** A separate in-memory workspace: none of these requests go to the server. */
export class DemoWorkspace {
  private state: DemoState;
  constructor(today?: string) { this.state = createDemoState(today); }
  private id() { return `demo-created-${++this.state.sequence}`; }
  private course(id: string) {
    const course = this.state.courses.find(item => item.id === id);
    if (!course) throw new DemoError("This sample course is no longer available.", 404);
    return course;
  }
  private topic(id: string): Topic {
    const topic = this.state.courses.flatMap(course => course.topics).find(item => item.id === id);
    if (!topic) throw new DemoError("This sample topic is no longer available.", 404);
    return topic;
  }
  private block(id: string) {
    const block = this.state.blocks.find(item => item.id === id);
    if (!block) throw new DemoError("This sample session is no longer available.", 404);
    return block;
  }
  private summary(course: CourseDetail): CourseSummary {
    const roots = course.topics.filter(topic => !topic.parentTopicId);
    const blocks = this.state.blocks.filter(block => block.course.id === course.id);
    return { id: course.id, name: course.name, examDate: course.examDate, ects: course.ects, grade: course.grade, passed: course.passed, isPassed: passed(course), difficulty: course.difficulty, studyDays: course.studyDays,
      topicsDone: roots.filter(topic => topic.done).length, topicsTotal: roots.length,
      remainingMinutes: blocks.filter(block => !block.completed && block.kind === "study").reduce((sum, block) => sum + block.minutes, 0),
      completedMinutes: blocks.filter(block => block.completed).reduce((sum, block) => sum + block.minutes, 0), loggedMinutes: blocks.reduce((sum, block) => sum + block.actualMinutes, 0) };
  }
  private present(block: DemoBlock): MobileBlock {
    const topic = this.topic(block.topicId);
    const notes = [...(this.state.notes[topic.id] ?? [])];
    if (topic.note) notes.push({ id: `topic:${topic.id}`, body: topic.note, createdAt: `${this.state.today}T08:00:00.000Z`, updatedAt: this.noteDates[topic.id] ?? `${this.state.today}T08:00:00.000Z` });
    return { id: block.id, title: block.title, topicId: topic.id, minutes: block.minutes, completed: block.completed, kind: block.kind, course: block.course,
      task: topic.task, progress: this.state.progress[topic.id] ?? null, note: topic.note, notes, fileAvailable: false };
  }
  private noteDates: Record<string, string> = {};
  private stamp(previous?: string) { return new Date(Math.max(Date.now(), Date.parse(previous ?? "") + 1 || 0)).toISOString(); }
  private createBlock(course: CourseDetail, topic: Topic, minutes = 30, date = this.state.today): DemoBlock {
    const block: DemoBlock = { id: this.id(), topicId: topic.id, title: topic.title, minutes, completed: false, kind: "study", course: { id: course.id, name: course.name }, task: topic.task, progress: null, date, start: null, end: null, actualMinutes: 0 };
    this.state.blocks.push(block); return block;
  }
  private today(): MobileToday {
    const state = this.state;
    const blocks = state.blocks.filter(block => block.date === state.today).map(block => this.present(block));
    const open = blocks.filter(block => !block.completed);
    const resumable = state.blocks.filter(block => !block.completed && state.progress[block.topicId]).sort((a, b) => state.progress[b.topicId].updatedAt.localeCompare(state.progress[a.topicId].updatedAt))[0];
    const exams = state.courses.filter(course => !passed(course) && course.examDate >= state.today).sort((a, b) => a.examDate.localeCompare(b.examDate));
    const overdue = state.blocks.filter(block => !block.completed && block.date < state.today);
    const reviews = open.filter(block => block.kind === "review");
    const minutes = (items: MobileBlock[]) => items.reduce((sum, block) => sum + block.minutes, 0);
    const preview = (remaining: MobileBlock[]) => ({ beforeCount: open.length, afterCount: remaining.length, moved: open.length - remaining.length, afterPaceMin: minutes(remaining), examReach: "none" });
    return { date: state.today, user: state.preferences.user, blocks,
      nextBlockId: resumable?.id ?? open[0]?.id, resumeBlock: resumable && resumable.date !== state.today ? this.present(resumable) : null,
      nextExam: exams[0] ? { name: exams[0].name, date: exams[0].examDate } : null,
      summary: { plannedMinutes: minutes(blocks), completedMinutes: minutes(blocks.filter(block => block.completed)), completedCount: blocks.filter(block => block.completed).length, totalCount: blocks.length },
      assignments: state.courses.flatMap(course => course.assignments.filter(assignment => !assignment.done).map(assignment => ({ ...assignment, course: { id: course.id, name: course.name } }))),
      lectures: state.lectures.filter(lecture => lecture.weekday === new Date(`${state.today}T12:00:00Z`).getUTCDay()),
      planHealth: { overdueSessions: overdue.length, overdueMinutes: minutes(overdue), availableMinutes: Math.max(0, state.preferences.preferences.dailyBudgetMin - minutes(blocks.filter(block => block.completed))), overloaded: false, undoAvailable: !!state.undo,
        previews: { protect: preview(open.filter(block => !reviews.includes(block))), move: preview([]), lighter: preview(open) },
        nextDays: [0, 1, 2].map(delta => { const date = shiftDay(state.today, delta); const items = state.blocks.filter(block => block.date === date && !block.completed); return { date, count: items.length, minutes: minutes(items) }; }) } };
  }
  private calendar(anchor = this.state.today): CalendarData {
    const offset = (new Date(`${day(anchor)}T12:00:00Z`).getUTCDay() + 6) % 7;
    const start = shiftDay(anchor, -offset); const days = Array.from({ length: 7 }, (_, index) => shiftDay(start, index));
    return { today: this.state.today, days, lectures: this.state.lectures,
      blocks: this.state.blocks.filter(block => days.includes(block.date)).map(block => ({ ...block, topicTitle: block.title })),
      exams: this.state.courses.filter(course => !passed(course) && days.includes(course.examDate)).map(course => ({ id: course.id, name: course.name, date: course.examDate })) };
  }
  private exams(): ExamData {
    const allCourses = this.state.courses.map(course => this.summary(course));
    return { today: this.state.today, semester: null, checkedAt: null, allCourses, results: allCourses.filter(course => course.isPassed || course.grade !== null),
      courses: allCourses.filter(course => !course.isPassed).sort((a, b) => a.examDate.localeCompare(b.examDate)).map(course => ({ id: course.id, name: course.name, currentDate: course.examDate, hint: "unpublished", suggestedKey: "", matchedKey: "", published: null })) };
  }
  private practice(courseId: string): PracticeData {
    const course = this.course(courseId); const cards: PracticeCard[] = [];
    for (const topic of course.topics) {
      const confidence = topic.confidence === "solid" || topic.confidence === "practice" || topic.confidence === "struggling" ? topic.confidence : null;
      if (topic.task?.checkQuestion) cards.push({ topicId: topic.id, topicTitle: topic.title, question: topic.task.checkQuestion, answerKey: topic.task.answerKey, confidence });
      for (const question of topic.questions) cards.push({ topicId: topic.id, topicTitle: topic.title, question, confidence });
    }
    return { courseId, courseName: course.name, cards };
  }
  private insights(): InsightsData {
    const state = this.state; const courses = state.courses.map(course => this.summary(course)); const week = this.calendar().days;
    const weekBlocks = state.blocks.filter(block => week.includes(block.date));
    const weekPlanned = weekBlocks.reduce((sum, block) => sum + block.minutes, 0); const weekDone = weekBlocks.filter(block => block.completed).reduce((sum, block) => sum + block.minutes, 0);
    const total = (key: "loggedMinutes" | "completedMinutes" | "remainingMinutes") => courses.reduce((sum, course) => sum + course[key], 0);
    const grades = courses.filter(course => course.grade !== null && course.grade <= 4);
    return { today: state.today, hasData: courses.length > 0, loggedMinutes: total("loggedMinutes"), totalPlannedMinutes: state.blocks.reduce((sum, block) => sum + block.minutes, 0), totalCompletedMinutes: total("completedMinutes"),
      currentStreak: 1, longestStreak: 2, weekPlanned, weekDone, weekPct: weekPlanned ? weekDone / weekPlanned * 100 : 0, duePct: 0, consistency: 50, activeDays: 3, upcomingWorkload: total("remainingMinutes"), completedModules: courses.filter(course => course.isPassed).length,
      grades: { gpa: grades.length ? grades.reduce((sum, course) => sum + course.grade!, 0) / grades.length : null, lpEarned: courses.filter(course => course.isPassed).reduce((sum, course) => sum + (course.ects ?? 0), 0), gradedCount: grades.length },
      evidence: { attempts: state.blocks.filter(block => block.outcome === "complete" || block.outcome === "practice").length, goalsMet: state.blocks.filter(block => block.outcome === "complete").length, practiceNeeded: state.blocks.filter(block => block.outcome === "practice").length, laterRecall: 0 },
      dailyLoad: week.map(date => ({ key: date, label: new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" }), min: state.blocks.filter(block => block.date === date && block.completed).reduce((sum, block) => sum + block.actualMinutes, 0) })),
      heatmap: Array.from({ length: 84 }, (_, index) => { const date = shiftDay(state.today, index - 83); return { date, min: state.blocks.filter(block => block.date === date && block.completed).reduce((sum, block) => sum + block.actualMinutes, 0), future: false, examWeek: false }; }),
      courses: courses.map(course => ({ id: course.id, name: course.name, grade: course.grade, passed: course.isPassed, ects: course.ects, examDate: course.examDate, topicsTotal: course.topicsTotal, topicsDone: course.topicsDone, progressPct: course.topicsTotal ? course.topicsDone / course.topicsTotal * 100 : 0,
        actualMinutes: course.loggedMinutes, remainingStudyMinutes: course.remainingMinutes, daysToExam: Math.round((Date.parse(course.examDate) - Date.parse(state.today)) / 86400_000), pressurePerDay: 0 })) };
  }
  request(path: string, options: Options = {}): unknown {
    const url = new URL(path, "https://demo.invalid/"); const parts = url.pathname.slice(1).split("/").map(decodeURIComponent);
    const method = options.method ?? "GET";
    let result: unknown;
    if (method === "GET") {
      if (parts[0] === "today") result = this.today();
      else if (parts[0] === "courses") { const course = parts[1] ? this.course(parts[1]) : null; result = course ? { ...course, isPassed: passed(course) } : this.state.courses.map(item => this.summary(item)); }
      else if (parts[0] === "blocks") result = this.present(this.block(parts[1]));
      else if (parts[0] === "calendar") result = this.calendar(url.searchParams.get("week") ?? undefined);
      else if (parts[0] === "exams") result = this.exams();
      else if (parts[0] === "preferences") result = this.state.preferences;
      else if (parts[0] === "insights") result = this.insights();
      else if (parts[0] === "practice") result = this.practice(url.searchParams.get("courseId") ?? "");
      else if (parts[0] === "catalog") { const term = (url.searchParams.get("q") ?? "").toLowerCase(); result = this.state.catalog.filter(item => `${item.name} ${item.code}`.toLowerCase().includes(term)); }
      else throw new DemoError("This feature needs a signed-in account.", 404);
    } else if (parts[0] === "actions" && method === "POST") {
      const body = options.body as { fields?: FormFields } | undefined;
      result = this.action(parts[1], body?.fields ?? {});
    } else if (parts[0] === "blocks" && parts.length === 3) result = this.updateSession(parts[1], parts[2], options.body as Record<string, unknown>);
    else throw new DemoError("This feature needs a signed-in account.", 404);
    return copyDemo(result);
  }
  private updateSession(id: string, operation: string, input: Record<string, unknown>) {
    const block = this.block(id); const topic = this.topic(block.topicId);
    if (!input || input.topicId !== block.topicId) throw new DemoError("This sample session has changed.", 404);
    if (block.completed) return { ok: true };
    const response = typeof input.response === "string" ? input.response.slice(0, 4000) : "";
    if (operation === "progress") {
      const progress = { topicId: topic.id, response, elapsedSeconds: number(Number(input.elapsedSeconds), 0, 36000), updatedAt: String(input.updatedAt), sessionMinutes: number(Number(input.sessionMinutes ?? block.minutes), 1, 600) };
      if (!Number.isFinite(Date.parse(progress.updatedAt))) throw new DemoError("Invalid saved progress.");
      if (!this.state.progress[topic.id] || progress.updatedAt >= this.state.progress[topic.id].updatedAt) this.state.progress[topic.id] = progress;
    } else if (operation === "finish" || operation === "result") {
      const actual = operation === "finish" ? Math.floor(number(Number(input.elapsedSeconds), 0, 36000) / 60) : number(Number(input.actualMinutes), 0, 600);
      if (operation === "result" && !["complete", "practice"].includes(String(input.outcome))) throw new DemoError("Choose a learning outcome.");
      if (operation === "result" && input.outcome === "complete" && (!input.checked || topic.task?.checkQuestion && !response.trim())) throw new DemoError("Write an answer and check your result against the goal.");
      this.state.undo = null;
      const planned = block.minutes;
      block.actualMinutes = actual; block.completed = true; block.outcome = operation === "finish" ? "session" : input.outcome as "complete" | "practice";
      delete this.state.progress[topic.id];
      if (response.trim()) (this.state.notes[topic.id] ??= []).unshift({ id: `session:${id}`, body: response.trim(), createdAt: this.stamp(), updatedAt: this.stamp() });
      if (operation === "result" && input.outcome === "complete") { topic.done = true; this.state.blocks.filter(item => item.topicId === topic.id).forEach(item => { item.completed = true; }); }
      else if (operation === "finish") { block.minutes = Math.min(planned, Math.ceil(Number(input.elapsedSeconds) / 60)); if (block.minutes < planned) this.createBlock(this.course(block.course.id), topic, planned - block.minutes, shiftDay(this.state.today, 1)); }
      else this.createBlock(this.course(block.course.id), topic, 15, shiftDay(this.state.today, 1));
    } else throw new DemoError("This demo action is unavailable.", 404);
    return { ok: true };
  }
  private action(name: string, fields: FormFields): unknown {
    const value = (key: string) => String(fields[key] ?? ""); const state = this.state;
    if (name === "undoRecovery") {
      if (!state.undo) throw new DemoError("There is no demo adjustment to undo.");
      state.blocks = state.undo; state.undo = null; return { ok: true, message: "undo-done" };
    }
    if (["recoverPlan", "protectToday", "moveOptional"].includes(name)) {
      state.undo = copyDemo(state.blocks);
      state.blocks.filter(block => !block.completed && (name === "recoverPlan" ? block.date <= state.today : block.date === state.today && (name !== "protectToday" || block.kind === "review")))
        .forEach((block, index) => { block.date = name === "recoverPlan" ? shiftDay(state.today, Math.floor(index / 2)) : shiftDay(state.today, 1); block.start = null; block.end = null; });
      return { ok: true };
    }
    if (name === "addFocusNote" || name === "updateFocusNote") {
      const topic = this.topic(value("topicId")); const id = value("id"); const body = value("body").trim();
      if (!id || !body || body.length > (id.startsWith("topic:") ? 10000 : 4000)) throw new DemoError("Write a note before saving.");
      const notes = state.notes[topic.id] ??= [];
      const existing = id.startsWith("topic:") && id === `topic:${topic.id}` && topic.note
        ? { id, body: topic.note, createdAt: `${state.today}T08:00:00.000Z`, updatedAt: this.noteDates[topic.id] ?? `${state.today}T08:00:00.000Z` } : notes.find(note => note.id === id);
      if (name === "addFocusNote" && existing) return { ok: true, note: existing };
      if (name === "updateFocusNote" && !existing) throw new DemoError("This note is no longer available.", 404);
      if (existing && value("updatedAt") !== existing.updatedAt) throw new DemoError("This note changed. Refresh your notes before editing again.");
      const note: MobileFocusNote = { id, body, createdAt: existing?.createdAt ?? this.stamp(), updatedAt: this.stamp(existing?.updatedAt) };
      if (id.startsWith("topic:")) { topic.note = body; this.noteDates[topic.id] = note.updatedAt; }
      else if (existing) notes[notes.findIndex(item => item.id === id)] = note;
      else notes.unshift(note);
      return { ok: true, note };
    }
    if (name === "startFocus") {
      const course = this.course(value("courseId")); let topic = value("topicId") ? this.topic(value("topicId")) : course.topics.find(item => !item.done);
      if (!topic && !value("topicId") && !passed(course)) {
        topic = { id: this.id(), title: course.name, done: false, confidence: null, parentTopicId: null, note: "", questions: [], task: null };
        course.topics.push(topic);
      }
      if (!topic || !course.topics.includes(topic)) throw new DemoError("Choose an unfinished topic to study.");
      const block = state.blocks.find(item => item.topicId === topic.id && !item.completed) ?? this.createBlock(course, topic);
      return { ok: true, blockId: block.id, topicId: topic.id, kind: block.kind };
    }
    if (name === "createCourse") {
      if (!value("name").trim()) throw new DemoError("Enter a course name.");
      const course: CourseDetail = { id: this.id(), name: value("name").trim(), examDate: day(value("examDate")), ects: null, grade: null, passed: false, isPassed: false,
        difficulty: number(value("difficulty") || "3", 1, 5), studyDays: Array.isArray(fields.studyDays) ? fields.studyDays.join(",") : value("studyDays") || "1,2,3,4,5", topics: [], files: [], assignments: [] };
      const budget = number(value("dailyBudgetMin") || "90", 15, 360);
      course.topics = value("topics").split("\n").map(title => title.trim()).filter(Boolean).slice(0, 100).map(title => ({ id: this.id(), title, done: false, confidence: null, parentTopicId: null, task: null, note: "", questions: [] }));
      state.courses.push(course); course.topics.forEach((topic, index) => this.createBlock(course, topic, 30, shiftDay(state.today, Math.floor(index / 2))));
      state.preferences.preferences.dailyBudgetMin = budget; state.undo = null;
      return { ok: true, redirect: `/courses/${course.id}` };
    }
    if (name === "addFromCatalog") {
      const ids = Array.isArray(fields.moduleId) ? fields.moduleId : [value("moduleId")];
      state.catalog.filter(item => ids.includes(item.id)).forEach(item => this.action("createCourse", { ...fields, name: item.name, examDate: item.examDate!, topics: item.content.split(", ").join("\n") }));
      return { ok: true };
    }
    if (["updateCourse", "saveGrade", "setPassed", "refreshPlan", "deleteCourse"].includes(name)) {
      const course = this.course(value("courseId"));
      if (name === "deleteCourse") { state.courses = state.courses.filter(item => item !== course); state.blocks = state.blocks.filter(block => block.course.id !== course.id); }
      else if (name === "updateCourse") { const examDate = day(value("examDate")); const difficulty = number(value("difficulty"), 1, 5); course.examDate = examDate; course.difficulty = difficulty; course.studyDays = Array.isArray(fields.studyDays) ? fields.studyDays.join(",") : value("studyDays"); }
      else if (name === "saveGrade") course.grade = value("grade").trim() ? number(value("grade").replace(",", "."), 1, 5) : null;
      else if (name === "setPassed") course.passed = value("passed") === "1";
      else course.topics.filter(topic => !topic.done && !state.blocks.some(block => block.topicId === topic.id && !block.completed)).forEach(topic => this.createBlock(course, topic));
      course.isPassed = passed(course);
      if (course.isPassed) state.blocks = state.blocks.filter(block => block.course.id !== course.id || block.completed);
      else if (name !== "deleteCourse") course.topics.filter(topic => !topic.done && !state.blocks.some(block => block.topicId === topic.id && !block.completed)).forEach(topic => this.createBlock(course, topic));
    } else if (["toggleTopic", "setConfidence", "deleteTopic", "saveNote", "deleteNote"].includes(name)) {
      const topic = this.topic(value("topicId"));
      if (name === "toggleTopic") {
        topic.done = value("done") === "true";
        if (topic.done) state.blocks.filter(block => block.topicId === topic.id).forEach(block => { block.completed = true; });
        else if (!state.blocks.some(block => block.topicId === topic.id && !block.completed)) this.createBlock(this.course(value("courseId")), topic);
      }
      else if (name === "setConfidence") { if (!["", "solid", "practice", "struggling"].includes(value("confidence"))) throw new DemoError("Choose a confidence rating."); topic.confidence = value("confidence") || null; }
      else if (name === "deleteTopic") { state.courses.forEach(course => { course.topics = course.topics.filter(item => item !== topic); }); state.blocks = state.blocks.filter(block => block.topicId !== topic.id); }
      else { topic.note = name === "deleteNote" ? "" : value("body"); this.noteDates[topic.id] = this.stamp(this.noteDates[topic.id]); }
    } else if (name === "saveStudyTask") {
      const course = this.course(value("courseId"));
      const title = value("title").trim(); const instruction = value("instruction").trim(); const successCriteria = value("successCriteria").trim();
      const minutes = number(value("estimatedMinutes"), 5, 600);
      if (!title || !instruction || !successCriteria || !!value("checkQuestion") !== !!value("answerKey")) throw new DemoError("Add a title, instruction and goal, and both parts of any recall check.");
      const sourceUrl = value("sourceUrl").trim();
      if (sourceUrl) { let parsed: URL; try { parsed = new URL(sourceUrl); } catch { throw new DemoError("Use a complete http:// or https:// source link."); } if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new DemoError("Use a complete http:// or https:// source link."); }
      const topic: Topic = { id: this.id(), title, done: false, confidence: null, parentTopicId: null, note: "", questions: [], task: { instruction, successCriteria, sourceRef: value("sourceRef"), sourceFileId: null, sourceUrl: sourceUrl || null, checkQuestion: value("checkQuestion"), answerKey: value("answerKey") } };
      course.topics.push(topic); this.createBlock(course, topic, minutes);
    } else if (name === "addAssignment") {
      const course = this.course(value("courseId")); const title = value("title").trim(); if (!title) throw new DemoError("Enter a deadline title.");
      course.assignments.push({ id: this.id(), title, dueDate: day(value("dueDate")), done: false });
    } else if (name === "toggleAssignment" || name === "deleteAssignment") {
      const course = state.courses.find(item => item.assignments.some(assignment => assignment.id === value("assignmentId")));
      if (!course) throw new DemoError("This sample deadline is no longer available.", 404);
      if (name === "deleteAssignment") course.assignments = course.assignments.filter(assignment => assignment.id !== value("assignmentId"));
      else course.assignments.find(assignment => assignment.id === value("assignmentId"))!.done = value("done") === "true";
    } else if (["toggleBlock", "moveBlock", "saveBlockNote", "updateBlockTime"].includes(name)) {
      const block = this.block(value("blockId"));
      if (name === "toggleBlock") block.completed = value("done") === "true";
      else if (name === "saveBlockNote") { this.topic(block.topicId).note = value("body"); this.noteDates[block.topicId] = this.stamp(this.noteDates[block.topicId]); }
      else if (name === "moveBlock") { const next = shiftDay(block.date, 1); if (next >= this.course(block.course.id).examDate) throw new DemoError("This session must stay before the exam."); block.date = next; }
      else if (value("clear") === "1") { block.start = null; block.end = null; }
      else { const date = day(value("date")); const start = time(value("startHHmm")); const end = time(value("endHHmm")); if (end <= start) throw new DemoError("The end time must be after the start."); block.date = date; block.start = start; block.end = end; }
    } else if (name === "addLecture") {
      const startMin = time(value("start")); const endMin = time(value("end")); if (endMin <= startMin || !value("title").trim()) throw new DemoError("Check the class name and times.");
      state.lectures.push({ id: this.id(), title: value("title"), weekday: number(value("weekday"), 0, 6), startMin, endMin, location: value("location"), courseId: null });
    } else if (name === "deleteLecture") state.lectures = state.lectures.filter(lecture => lecture.id !== value("lectureId"));
    else if (name === "savePreferences") {
      const dayStartMin = time(value("dayStart")); const dayEndMin = time(value("dayEnd")); if (dayEndMin <= dayStartMin) throw new DemoError("The study window must end after it starts.");
      const dailyBudgetMin = number(value("dailyBudgetMin"), 15, 360); if (!["morning", "evening", "any"].includes(value("energy"))) throw new DemoError("Choose your preferred study time.");
      state.preferences.preferences = { dayStartMin, dayEndMin, dailyBudgetMin, energy: value("energy") };
    } else if (name === "autoSchedule") {
      let placed = 0; let unplaced = 0;
      for (const date of this.calendar(value("weekStart") || undefined).days.filter(date => !value("day") || date === value("day"))) {
        let cursor = state.preferences.preferences.dayStartMin;
        const occupied = [
          ...state.lectures.filter(item => item.weekday === new Date(`${date}T12:00:00Z`).getUTCDay()).map(item => ({ start: item.startMin, end: item.endMin })),
          ...state.blocks.filter(item => item.date === date && item.start !== null && item.end !== null).map(item => ({ start: item.start!, end: item.end! })),
        ].sort((a, b) => a.start - b.start);
        for (const block of state.blocks.filter(item => item.date === date && !item.completed && item.start === null && item.end === null)) {
          for (const interval of occupied) if (cursor < interval.end && cursor + block.minutes > interval.start) cursor = interval.end;
          if (cursor + block.minutes > state.preferences.preferences.dayEndMin) { unplaced++; continue; }
          block.start = cursor; block.end = cursor + block.minutes; cursor = block.end + 10; placed++;
        }
      }
      state.undo = null; return { ok: true, placed, unplaced };
    } else throw new DemoError("Sign in to use uploads, AI preparation, or live university services.");
    state.undo = null; return { ok: true };
  }
}

let activeDemo: { token: string; workspace: DemoWorkspace } | null = null;
let sessionSequence = 0;
export function startDemoSession(): MobileSession & { server: string } {
  const token = `demo-${Date.now()}-${++sessionSequence}`;
  activeDemo = { token, workspace: new DemoWorkspace() };
  return { server: DEMO_SERVER, token, userId: token, expiresAt: new Date(Date.now() + 86400_000).toISOString() };
}
export function endDemoSession(token: string) { if (activeDemo?.token === token) activeDemo = null; }
export function demoRequest(token: string | null, path: string, options?: Options) {
  if (!activeDemo || activeDemo.token !== token) throw new DemoError("Reopen the demo from the sign-in screen.", 401);
  return activeDemo.workspace.request(path, options);
}
