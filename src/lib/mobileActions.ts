import * as courses from "../app/courses/actions";
import * as study from "../app/courses/studyActions";
import * as today from "../app/today/actions";
import * as timetable from "../app/timetable/actions";
import { saveStudyPrefs } from "../app/settings/actions";
import { refreshExamDates, getExamOptions } from "../app/exams/actions";
import { previewExamDates, syncExamDates, rebuildAfterExamSync } from "../app/settings/examActions";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { ApiError } from "./apiError";
import { withAuthenticatedMobileUser } from "./mobileUserContext";
import { prisma } from "./db";
import { dayMinutesToInstant, hhmmToMinutes } from "./calendarTime";
import { isValidISODate } from "./validate";

const forms: Record<string, (data: FormData) => Promise<unknown>> = {
  createCourse: courses.createCourse, updateCourse: courses.updateCourse, deleteCourse: courses.deleteCourse,
  addFromCatalog: courses.addFromCatalog, importSyllabus: courses.importSyllabus, refreshPlan: courses.refreshPlan,
  applyProgress: courses.applyProgress, saveGrade: courses.saveGradeInline, setPassed: courses.toggleCoursePassed,
  toggleTopic: courses.toggleTopic, setConfidence: courses.setTopicConfidence, deleteTopic: courses.deleteTopic,
  saveNote: courses.saveNote, deleteNote: courses.deleteNote, addAssignment: courses.addAssignment,
  toggleAssignment: courses.toggleAssignment, deleteAssignment: courses.deleteAssignment,
  updateBlockTime: courses.updateBlockTime, moveBlock: courses.moveBlockToTomorrow, toggleBlock: courses.toggleBlock,
  autoSchedule: courses.autoScheduleWeekTimes, saveBlockNote: courses.saveBlockNote,
  uploadMaterial: study.uploadMaterial, analyzeMaterial: courses.analyzeModuleUpload, deleteMaterial: courses.deleteModuleFile,
  saveStudyTask: study.saveStudyTask, quickStart: study.quickStartStudy,
  addLecture: timetable.addLecture, deleteLecture: timetable.deleteLecture, savePreferences: saveStudyPrefs,
  recoverPlan: today.recoverPlan, protectToday: today.protectToday, moveOptional: today.moveOptionalWork, undoRecovery: today.undoRecovery,
};

export function mobileForm(input: unknown): FormData {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length > 40) throw new ApiError("BAD_REQUEST", "Check the form fields.");
  const form = new FormData();
  for (const [key, raw] of Object.entries(input)) {
    if (key.length > 80) throw new ApiError("BAD_REQUEST", "Invalid field name.");
    const values = Array.isArray(raw) ? raw : [raw];
    if (values.length > 500) throw new ApiError("BAD_REQUEST", "Too many selected items.");
    for (const value of values) {
      if (typeof value !== "string" || value.length > 100_000) throw new ApiError("BAD_REQUEST", "Invalid form value.");
      form.append(key, value);
    }
  }
  return form;
}

const messages: Record<string, string> = {
  "rate-limited": "Please wait a minute before trying again.", invalid: "Check the values and try again.",
  "not-found": "This item is no longer available.", "exam-past": "Choose an upcoming exam date.", "past-exam": "Choose an upcoming exam date.",
  "exam-too-far": "Choose an exam within the next two years.", "source-unavailable": "The university exam schedule is unavailable. Your saved dates are unchanged.",
  conflict: "The exam schedule changed. Refresh before applying dates.", "exam-day": "Study sessions must be before the exam.",
  "save-error": "Couldn't save the exam dates. Please try again.",
};

function failure(reason: string): never {
  throw new ApiError(reason === "rate-limited" || reason === "RATE_LIMITED" ? "RATE_LIMITED" : reason === "not-found" || reason === "NOT_FOUND" ? "NOT_FOUND" : "BAD_REQUEST",
    messages[reason] ?? `Couldn't complete this change (${reason.replaceAll("-", " ").toLowerCase()}).`);
}

/** Reuse the web's validation, ownership checks, scheduling and AI budgets. */
export async function mobileAction(userId: string, name: string, form: FormData) {
  return withAuthenticatedMobileUser(userId, async () => {
    const required: Record<string, string> = { updateCourse: "courseId", deleteCourse: "courseId", refreshPlan: "courseId", applyProgress: "courseId", saveGrade: "courseId", setPassed: "courseId", toggleTopic: "topicId", setConfidence: "topicId", deleteTopic: "topicId", saveNote: "topicId", deleteNote: "topicId", addAssignment: "courseId", toggleAssignment: "assignmentId", deleteAssignment: "assignmentId", updateBlockTime: "blockId", moveBlock: "blockId", toggleBlock: "blockId", saveBlockNote: "blockId", uploadMaterial: "courseId", analyzeMaterial: "courseId", deleteMaterial: "moduleFileId", saveStudyTask: "courseId", quickStart: "courseId", deleteLecture: "lectureId", startFocus: "courseId", prepareMaterial: "fileId", recognizeMaterial: "fileId", acceptOutline: "fileId", acceptTasks: "fileId", examOptions: "courseId" };
    if (Object.hasOwn(required, name) && !form.get(required[name])) failure("invalid");
    // Existing web actions sometimes silently return for a stale id. Native
    // callers need a real error, and must never infer another student's ids.
    for (const [field, model] of [["courseId", "course"], ["topicId", "topic"], ["blockId", "studyBlock"], ["fileId", "moduleFile"], ["moduleFileId", "moduleFile"], ["assignmentId", "assignment"], ["lectureId", "lecture"]] as const) {
      const id = form.get(field);
      if (!id) continue;
      if (typeof id !== "string" || id.length > 200) throw new ApiError("BAD_REQUEST", "Invalid item.");
      const owned = model === "course" ? await prisma.course.count({ where: { id, userId } })
        : model === "lecture" ? await prisma.lecture.count({ where: { id, userId } })
        : model === "topic" ? await prisma.topic.count({ where: { id, course: { userId } } })
        : model === "studyBlock" ? await prisma.studyBlock.count({ where: { id, course: { userId } } })
        : model === "moduleFile" ? await prisma.moduleFile.count({ where: { id, course: { userId } } })
        : await prisma.assignment.count({ where: { id, course: { userId } } });
      if (!owned) throw new ApiError("NOT_FOUND", "This item is no longer available.");
    }
    const value = (key: string) => String(form.get(key) ?? "").slice(0, 200);
    if (name === "updateBlockTime" && value("clear") !== "1") {
      const date = value("date"); const start = hhmmToMinutes(value("startHHmm")); const end = hhmmToMinutes(value("endHHmm"));
      if (!isValidISODate(date) || start === null || end === null || end <= start) failure("invalid");
      form.set("start", dayMinutesToInstant(date, start).toISOString()); form.set("end", dayMinutesToInstant(date, end).toISOString());
    }
    try {
      let result: unknown;
      if (Object.hasOwn(forms, name)) result = await forms[name](form);
      else if (name === "refreshExams") result = await refreshExamDates();
      else if (name === "previewExams") result = await previewExamDates();
      else if (name === "examOptions") result = await getExamOptions(value("courseId"));
      else if (name === "syncExams") { let changes: unknown; try { changes = JSON.parse(String(form.get("changes") ?? "")); } catch { failure("invalid"); } result = await syncExamDates(changes); }
      else if (name === "rebuildAfterExamSync") { if (!await rebuildAfterExamSync()) failure("save-error"); result = { ok: true }; }
      else if (name === "startFocus") result = await study.startFocusSession({ courseId: value("courseId"), topicId: value("topicId") || undefined, fileId: value("fileId") || undefined, language: value("language") === "de" ? "de" : "en" });
      else if (name === "prepareMaterial") result = await study.prepareMaterialPlan(value("fileId"), value("language") === "de" ? "de" : "en");
      else if (name === "recognizeMaterial") result = await study.recognizeMaterial(value("fileId"));
      else if (name === "acceptOutline" || name === "acceptTasks") {
        const ids = form.getAll("ids").filter((id): id is string => typeof id === "string" && id.length <= 200).slice(0, 500);
        result = name === "acceptOutline" ? await study.applyMaterialOutline(value("fileId"), value("draftId"), ids, false)
          : await study.addMaterialTasks(value("fileId"), value("draftId"), ids, false);
      } else throw new ApiError("NOT_FOUND", "Action not found.");
      if (result && typeof result === "object" && "ok" in result && result.ok === false) {
        const r = result as { reason?: string; error?: string };
        failure(r.reason ?? r.error ?? "invalid");
      }
      if (result && typeof result === "object" && "rateLimited" in result && result.rateLimited) failure("rate-limited");
      return result ?? { ok: true };
    } catch (error) {
      if (!isRedirectError(error)) throw error;
      const redirect = getURLFromRedirectError(error) ?? "/today";
      const url = new URL(redirect, "http://localhost");
      const message = url.searchParams.get("msg");
      if (message && (message in messages || /failed|invalid|unsupported|empty|limit-|ai-off|unavailable|nofile/.test(message))) failure(message);
      return { ok: true, redirect, message };
    }
  });
}
