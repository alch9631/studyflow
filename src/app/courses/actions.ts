"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { regeneratePlan, healCoursePlan, aiOptimizeCourse, todayISO } from "@/lib/planService";
import {
  extractSyllabus,
  isSyllabusAIEnabled,
  interpretProgress,
  analyzeModuleContent,
} from "@/lib/syllabus";
import { MINUTES_PER_EFFORT } from "@/lib/planner";
import { rateLimit } from "@/lib/rateLimit";
import {
  ValidationError,
  str,
  requireText,
  requireId,
  requireDate,
  optionalDate,
  longText,
  toUTCDate,
  sanitizeStudyDays,
  clampInt,
  parseGrade,
} from "@/lib/validate";
import { LIMITS, guardCount, guardCountBy } from "@/lib/limits";

/** Create a course (+ its topics) and generate the first plan. */
export async function createCourse(formData: FormData) {
  const userId = await getCurrentUserId();

  const name = requireText(formData.get("name"), "Course name");
  const examDate = requireDate(formData.get("examDate"), "Exam date", todayISO());
  const studyDays = sanitizeStudyDays(formData.getAll("studyDays").map(String));
  const topicLines = longText(formData.get("topics"))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, LIMITS.MAX_TOPICS_PER_COURSE);

  // Defensive caps: don't let a user create unbounded courses/topics.
  guardCount(await prisma.course.count({ where: { userId } }), LIMITS.MAX_COURSES_PER_USER, "courses");

  const course = await prisma.course.create({
    data: {
      name,
      examDate: toUTCDate(examDate),
      studyDays,
      userId,
      topics: {
        create: topicLines.map((title, i) => ({ title, order: i })),
      },
    },
  });

  await regeneratePlan(course.id);
  // Auto AI-optimize once (difficulty/order/review). Safe to fail — the
  // deterministic plan already exists.
  try {
    await aiOptimizeCourse(course.id);
  } catch {}
  redirect(`/courses/${course.id}`);
}

/**
 * Add courses straight from the university catalog (e.g. TUHH IIW modules).
 * Topics: extracted from the handbook text by AI when a key is set, else
 * sensible ECTS-sized placeholder units the student can refine.
 */
export async function addFromCatalog(formData: FormData) {
  const userId = await getCurrentUserId();
  // Bound the selection so junk/oversized ids can't reach Prisma.
  const ids = formData
    .getAll("moduleId")
    .map(String)
    .filter((s) => s.length > 0 && s.length <= 200)
    .slice(0, LIMITS.MAX_CATALOG_ADD_BATCH);
  if (ids.length === 0) redirect("/catalog");

  const templates = await prisma.moduleTemplate.findMany({
    where: { id: { in: ids } },
    select: { name: true, content: true, ects: true, code: true, examDate: true },
  });

  // Don't let a bulk catalog add push the user past the course cap.
  guardCountBy(
    await prisma.course.count({ where: { userId } }),
    templates.length,
    LIMITS.MAX_COURSES_PER_USER,
    "courses",
  );
  const aiOn = isSyllabusAIEnabled();
  // Fallback when a module has no published exam date (seminars, labs, electives).
  const defaultExam = new Date(Date.now() + 84 * 86400_000);

  for (const t of templates) {
    let topics: { title: string; effort: number }[] = [];
    if (aiOn) {
      try {
        const extracted = await extractSyllabus(`${t.name}\n\n${t.content}`);
        topics = extracted.topics;
      } catch {
        // fall through to placeholders
      }
    }
    if (topics.length === 0) {
      const units = Math.max(3, Math.round(t.ects / 2));
      topics = Array.from({ length: units }, (_, i) => ({
        title: `${t.name} — part ${i + 1}`,
        effort: 1,
      }));
    }

    const course = await prisma.course.create({
      data: {
        name: t.name,
        examDate: t.examDate ?? defaultExam,
        minutesPerDay: 120,
        studyDays: "1,2,3,4,5",
        ects: t.ects,
        sourceCode: t.code,
        userId,
        topics: { create: topics.map((tp, i) => ({ title: tp.title, effort: tp.effort, order: i })) },
      },
    });
    await regeneratePlan(course.id);
  }

  redirect("/courses");
}

/** Extract plain text from an uploaded study material (PDF, DOCX, txt, md). */
async function extractTextFromFile(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  if (name.endsWith(".pptx")) {
    throw new Error("PPTX isn't supported yet — export the slides to PDF and upload that.");
  }
  return buf.toString("utf-8"); // txt / md
}

/**
 * Build a course from a pasted syllabus AND/OR an uploaded study material
 * (lecture script, PDF, notes). AI extracts the topics + exam date, then plans.
 */
export async function importSyllabus(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimit(`ai:${userId}`)) {
    throw new Error("You're importing a lot quickly — give it a minute and try again.");
  }
  let text = longText(formData.get("syllabus"));
  const studyDays = sanitizeStudyDays(formData.getAll("studyDays").map(String));

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const fromFile = await extractTextFromFile(file);
    text = text ? `${text}\n\n${fromFile}` : fromFile;
  }
  if (!text) throw new Error("Paste text or upload a study material first");

  // Defensive cap before the AI call + write: don't exceed the course limit.
  guardCount(await prisma.course.count({ where: { userId } }), LIMITS.MAX_COURSES_PER_USER, "courses");

  const extracted = await extractSyllabus(text);

  // Fall back to ~4 weeks out if the syllabus didn't state an exam date.
  const examDate = extracted.examDate
    ? new Date(extracted.examDate + "T00:00:00Z")
    : new Date(Date.now() + 28 * 86400_000);

  // Bound AI-extracted topics so a huge syllabus can't create unbounded rows.
  const topics = extracted.topics.slice(0, LIMITS.MAX_TOPICS_PER_COURSE);

  const course = await prisma.course.create({
    data: {
      name: extracted.courseName || "Imported course",
      examDate,
      studyDays,
      userId,
      topics: {
        create: topics.map((t, i) => ({
          title: t.title,
          effort: t.effort,
          order: i,
        })),
      },
    },
  });

  await regeneratePlan(course.id);
  try {
    await aiOptimizeCourse(course.id);
  } catch {}
  redirect(`/courses/${course.id}`);
}

/** Re-run the AI optimizer (difficulty / order / spaced review) on demand. */
export async function reoptimizeCourse(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimit(`ai:${id}`)) redirect(`/courses/${id}?msg=rate-limited`);
  let ok = false;
  try {
    ok = await aiOptimizeCourse(id);
  } catch {
    ok = false;
  }
  redirect(`/courses/${id}?msg=${ok ? "optimized" : "optimize-failed"}`);
}

/**
 * #5 — Upload a module file (PDF/DOCX/TXT/MD), have AI analyze its CONTENT, and
 * rebuild the course's topics (with content-based difficulty + study-time
 * estimates), then reschedule. Stores the file's analysis for review.
 */
export async function analyzeModuleUpload(formData: FormData) {
  let courseId: string;
  try {
    courseId = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimit(`ai:${courseId}`)) redirect(`/courses/${courseId}?msg=rate-limited`);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/courses/${courseId}?msg=analyze-nofile`);
  }
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { name: true },
  });
  if (!course) redirect("/courses");

  let result = "analyze-error";
  let n = 0;
  try {
    const text = await extractTextFromFile(file as File);
    if (!text.trim()) throw new Error("No readable text in that file");
    const analysis = await analyzeModuleContent(course.name, text);
    if (analysis.topics.length > 0) {
      // Bound the content-derived topics to the per-course cap before writing.
      const newTopics = analysis.topics.slice(0, LIMITS.MAX_TOPICS_PER_COURSE);
      // Replace topics with the content-derived ones (effort from estimated time).
      await prisma.topic.deleteMany({ where: { courseId } });
      await prisma.topic.createMany({
        data: newTopics.map((t, i) => ({
          courseId,
          title: t.title,
          effort: Math.max(0.5, t.estMinutes / MINUTES_PER_EFFORT),
          order: i,
        })),
      });
      n = newTopics.length;
      await prisma.moduleFile.create({
        data: {
          courseId,
          filename: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          extractedChars: text.length,
          analysis: JSON.stringify({
            summary: analysis.summary,
            concepts: analysis.concepts,
            prerequisites: analysis.prerequisites,
          }),
        },
      });
      await prisma.course.update({ where: { id: courseId }, data: { aiOptimized: true } });
      await regeneratePlan(courseId);
      result = "analyzed";
    }
  } catch (e) {
    result =
      e instanceof Error && e.message.includes("PPTX") ? "analyze-unsupported" : "analyze-error";
  }
  redirect(`/courses/${courseId}?msg=${result}&n=${n}`);
}

/** Delete a course (cascades to its topics + study blocks). */
export async function deleteCourse(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  await prisma.course.delete({ where: { id } });
  redirect("/courses");
}

/** AI progress: read a plain-language status, mark matching topics done, replan. */
export async function applyProgress(formData: FormData) {
  let id: string;
  let status: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
    status = requireText(formData.get("status"), "Status", 5000);
  } catch {
    return;
  }
  if (!rateLimit(`ai:${id}`)) redirect(`/courses/${id}?msg=rate-limited`);

  const course = await prisma.course.findUnique({
    where: { id },
    select: { topics: { select: { id: true, title: true, done: true } } },
  });
  if (!course) return;

  // Note: redirect() must live OUTSIDE the try (it throws NEXT_REDIRECT).
  let result: "progress" | "progress-none" | "progress-error" = "progress-none";
  try {
    const updates = await interpretProgress(course.topics.map((t) => t.title), status);
    const wanted = new Map(updates.map((u) => [u.title.toLowerCase(), u.done]));
    let changed = 0;
    for (const t of course.topics) {
      const d = wanted.get(t.title.toLowerCase());
      if (d !== undefined && d !== t.done) {
        await prisma.topic.update({ where: { id: t.id }, data: { done: d } });
        changed++;
      }
    }
    result = changed > 0 ? "progress" : "progress-none";
  } catch {
    result = "progress-error";
  }
  await regeneratePlan(id);
  redirect(`/courses/${id}?msg=${result}`);
}

export type EditState = { ok: boolean; error?: string } | null;

/**
 * Inline edit from the Courses page (used with useActionState). Validates, saves,
 * reschedules, and returns a status the UI shows without navigating away.
 */
export async function editCourse(_prev: EditState, formData: FormData): Promise<EditState> {
  let id: string;
  let name: string;
  let examDate: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
    name = requireText(formData.get("name"), "Course name");
    examDate = requireDate(formData.get("examDate"), "Exam date", todayISO());
  } catch (e) {
    return { ok: false, error: e instanceof ValidationError ? e.message : "Invalid input." };
  }
  const studyDays = sanitizeStudyDays(formData.getAll("studyDays").map(String));

  try {
    await prisma.course.update({
      where: { id },
      data: { name, examDate: toUTCDate(examDate), studyDays },
    });
    await regeneratePlan(id);
    revalidatePath("/courses");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save — please try again." };
  }
}

/** Edit a course's exam date / capacity, then rebuild the plan around it. */
export async function updateCourse(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  let examDate: string | null;
  try {
    examDate = optionalDate(formData.get("examDate"), "Exam date", todayISO());
  } catch {
    redirect(`/courses/${id}?msg=past-exam`);
  }
  const studyDays = sanitizeStudyDays(formData.getAll("studyDays").map(String));

  await prisma.course.update({
    where: { id },
    data: {
      ...(examDate ? { examDate: toUTCDate(examDate) } : {}),
      studyDays,
    },
  });
  await regeneratePlan(id);
  redirect(`/courses/${id}?msg=saved`);
}

/** "I fell behind" — redistribute remaining work across the days left. */
export async function healCourse(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  const { isOverloaded } = await healCoursePlan(id);
  redirect(`/courses/${id}?msg=${isOverloaded ? "healed-over" : "healed"}`);
}

/** Log a finished focus session (Pomodoro) against a block — feeds adaptive pacing. */
export async function logFocus(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return;
  }
  // Clamp to a sane session length so a bad/negative value can't corrupt the
  // adaptive pacing estimates (actualMinutes feeds the calibration factor).
  const minutes = clampInt(formData.get("minutes"), 1, 600, 25);
  const path = str(formData.get("revalidate")) || "/today";
  const block = await prisma.studyBlock.findUnique({
    where: { id },
    select: { actualMinutes: true, minutes: true, completed: true },
  });
  if (block) {
    const actual = (block.actualMinutes ?? 0) + minutes;
    await prisma.studyBlock.update({
      where: { id },
      data: { actualMinutes: actual, completed: actual >= block.minutes || block.completed },
    });
  }
  revalidatePath(path);
}

/** Check off (or uncheck) a single study block — "I did this session". */
export async function toggleBlock(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return;
  }
  const path = str(formData.get("revalidate")) || "/today";
  const block = await prisma.studyBlock.findUnique({
    where: { id },
    select: { completed: true },
  });
  if (block) {
    await prisma.studyBlock.update({
      where: { id },
      data: { completed: !block.completed },
    });
  }
  revalidatePath(path);
}

/** Add a dated deliverable (homework, lab report, project) to a course. */
export async function addAssignment(formData: FormData) {
  let courseId: string;
  let title: string;
  let dueDate: string;
  try {
    courseId = requireId(formData.get("courseId"), "Course");
    title = requireText(formData.get("title"), "Assignment title");
    // Deliverables can legitimately be logged with a past due date.
    dueDate = requireDate(formData.get("dueDate"), "Due date", todayISO(), { allowPast: true });
  } catch {
    return;
  }
  // Defensive cap: don't let a course accumulate unbounded assignments.
  try {
    guardCount(
      await prisma.assignment.count({ where: { courseId } }),
      LIMITS.MAX_ASSIGNMENTS_PER_COURSE,
      "assignments",
    );
  } catch {
    redirect(`/courses/${courseId}?msg=limit-assignments`);
  }
  await prisma.assignment.create({
    data: { courseId, title, dueDate: toUTCDate(dueDate) },
  });
  revalidatePath(`/courses/${courseId}`);
}

/** Tick an assignment done/undone. */
export async function toggleAssignment(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("assignmentId"), "Assignment");
  } catch {
    return;
  }
  const path = str(formData.get("revalidate"));
  const a = await prisma.assignment.findUnique({
    where: { id },
    select: { done: true, courseId: true },
  });
  if (a) {
    await prisma.assignment.update({ where: { id }, data: { done: !a.done } });
  }
  revalidatePath(path || `/courses/${a?.courseId ?? ""}`);
}

/** Remove an assignment. */
export async function deleteAssignment(formData: FormData) {
  let id: string;
  let courseId: string;
  try {
    id = requireId(formData.get("assignmentId"), "Assignment");
    courseId = requireId(formData.get("courseId"), "Course");
  } catch {
    return;
  }
  await prisma.assignment.delete({ where: { id } });
  revalidatePath(`/courses/${courseId}`);
}

/** Record (or clear) a course's final grade (German scale 1.0–5.0). */
export async function setGrade(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  const grade = parseGrade(formData.get("grade"));
  await prisma.course.update({ where: { id }, data: { grade } });
  redirect(`/courses/${id}?msg=graded`);
}

/** Toggle a topic done/undone, then rebuild the plan so it reflects reality. */
export async function toggleTopic(formData: FormData) {
  let id: string;
  let courseId: string;
  try {
    id = requireId(formData.get("topicId"), "Topic");
    courseId = requireId(formData.get("courseId"), "Course");
  } catch {
    return;
  }
  const topic = await prisma.topic.findUnique({
    where: { id },
    select: { done: true },
  });
  if (topic) {
    await prisma.topic.update({ where: { id }, data: { done: !topic.done } });
    await regeneratePlan(courseId);
  }
  revalidatePath(`/courses/${courseId}`);
}
