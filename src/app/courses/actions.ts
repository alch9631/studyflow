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
import { classifyFile, isFileCategory, type FileCategory } from "@/lib/fileCategory";
import {
  enforceRateLimit,
  RateLimitError,
  type RateLimitCategory,
} from "@/lib/rateLimitPolicy";
import {
  ValidationError,
  str,
  requireText,
  requireId,
  requireDate,
  optionalDate,
  optionalText,
  longText,
  toUTCDate,
  sanitizeStudyDays,
  clampInt,
  parseGrade,
  isValidISODate,
} from "@/lib/validate";
import { LIMITS, guardCount, guardCountBy } from "@/lib/limits";
import { logActionError, aiFailureBanner } from "@/lib/actionErrors";
import {
  ownsCourse,
  findOwnedCourse,
  updateOwnedCourse,
  deleteOwnedCourse,
  findOwnedTopic,
  findOwnedBlock,
  findOwnedAssignment,
  deleteOwnedAssignment,
  deleteOwnedModuleFile,
  upsertOwnedTopicNote,
  deleteOwnedTopicNote,
} from "@/lib/ownership";

/**
 * Boolean wrapper around `enforceRateLimit` for the action style here: actions
 * react to a breach by `redirect(...?msg=rate-limited)` rather than throwing,
 * so this catches `RateLimitError` and returns false. Unexpected errors rethrow.
 */
function rateLimitOK(category: RateLimitCategory, key: string): boolean {
  try {
    enforceRateLimit(category, key);
    return true;
  } catch (e) {
    if (e instanceof RateLimitError) return false;
    throw e;
  }
}

/** Create a course (+ its topics) and generate the first plan. */
export async function createCourse(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("COURSE_WRITE", userId)) redirect("/courses?msg=rate-limited");

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
  // deterministic plan already exists — but log so the failure isn't invisible.
  try {
    await aiOptimizeCourse(course.id);
  } catch (e) {
    logActionError("createCourse.aiOptimize", e);
  }
  redirect(`/courses/${course.id}`);
}

/**
 * Add courses straight from the university catalog (e.g. TUHH IIW modules).
 * Topics: extracted from the handbook text by AI when a key is set, else
 * sensible ECTS-sized placeholder units the student can refine.
 */
export async function addFromCatalog(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("COURSE_WRITE", userId)) redirect("/catalog?msg=rate-limited");
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
    // Each extraction is a paid LLM call, so a bulk add must spend from the AI
    // budget per module — not ride in under the cheaper COURSE_WRITE check.
    // When the AI budget runs out mid-batch, remaining modules get the
    // placeholder units below instead of blocking the add.
    if (aiOn && rateLimitOK("AI", userId)) {
      try {
        const extracted = await extractSyllabus(`${t.name}\n\n${t.content}`);
        topics = extracted.topics;
      } catch (e) {
        // Log, then fall through to placeholder units — a flaky AI call must not
        // block the catalog add (the student still gets a usable course).
        logActionError("addFromCatalog.extractSyllabus", e);
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
  if (!rateLimitOK("AI", userId)) {
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

  // Fall back to ~4 weeks out if the syllabus didn't state an exam date — or if
  // the model returned a non-ISO string ("TBD", "Februar 2026"), which would
  // otherwise become an Invalid Date and crash the Prisma write.
  const examDate =
    extracted.examDate && isValidISODate(extracted.examDate)
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
  // Bonus optimization — log if it fails so the swallowed error is diagnosable;
  // the deterministic plan is already saved, so we still land on the course.
  try {
    await aiOptimizeCourse(course.id);
  } catch (e) {
    logActionError("importSyllabus.aiOptimize", e);
  }
  redirect(`/courses/${course.id}`);
}

/** Re-run the AI optimizer (difficulty / order / spaced review) on demand. */
export async function reoptimizeCourse(formData: FormData) {
  const userId = await getCurrentUserId();
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimitOK("AI", id)) redirect(`/courses/${id}?msg=rate-limited`);
  // Don't let a non-owner trigger an (AI-spending) replan of someone else's course.
  if (!(await ownsCourse(userId, id))) redirect("/courses");

  // Distinguish "AI isn't set up" from "the AI call failed" so the banner is
  // honest. redirect() must stay OUTSIDE the try (it throws NEXT_REDIRECT).
  let outcome: string;
  if (!isSyllabusAIEnabled()) {
    outcome = "ai-unconfigured";
  } else {
    try {
      outcome = (await aiOptimizeCourse(id)) ? "optimized" : "optimize-failed";
    } catch (e) {
      logActionError("reoptimizeCourse", e);
      outcome = aiFailureBanner(e, "optimize-failed");
    }
  }
  // The optimizer rebuilt the plan — refresh Today (and the course page) so the
  // new schedule shows immediately without a manual reload. Skipped on no-op
  // outcomes (nothing changed), but harmless either way.
  if (outcome === "optimized") {
    revalidatePath("/today");
    revalidatePath(`/courses/${id}`);
  }
  redirect(`/courses/${id}?msg=${outcome}`);
}

/**
 * #5 — Upload a module file (PDF/DOCX/TXT/MD), have AI analyze its CONTENT, and
 * rebuild the course's topics (with content-based difficulty + study-time
 * estimates), then reschedule. Stores the file's analysis for review.
 */
export async function analyzeModuleUpload(formData: FormData) {
  const userId = await getCurrentUserId();
  let courseId: string;
  try {
    courseId = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimitOK("AI", courseId)) redirect(`/courses/${courseId}?msg=rate-limited`);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/courses/${courseId}?msg=analyze-nofile`);
  }
  // Ownership-scoped: a non-owner (or bad id) gets bounced, never another user's course.
  const course = await findOwnedCourse(userId, courseId);
  if (!course) redirect("/courses");

  // The user explicitly picks the document type in the upload form (pre-filled
  // with the filename auto-detect). We honour their choice if it's a valid
  // category; an empty/unknown value falls back to the auto-detect below.
  const docTypeRaw = formData.get("docType");
  const chosenType: FileCategory | null = isFileCategory(docTypeRaw) ? docTypeRaw : null;

  // Append vs replace. Default "replace" preserves existing callers that don't
  // send a mode field (the course-detail ModuleUploadForm). "append" keeps the
  // current topics and adds the file's topics after them.
  const mode = str(formData.get("mode")) === "append" ? "append" : "replace";

  let result = "analyze-error";
  let n = 0;
  try {
    const text = await extractTextFromFile(file as File);
    if (!text.trim()) throw new Error("No readable text in that file");
    // Feed the chosen type into analysis so the AI generates type-appropriate
    // topics (skript/slides → learning, uebung → practice, altklausur/mockexam
    // → exam-practice). Falls back to the filename auto-detect when unset.
    const analysisType = chosenType ?? classifyFile(file.name);
    const analysis = await analyzeModuleContent(course.name, text, analysisType);
    if (analysis.topics.length > 0) {
      // Bound the content-derived topics to the per-course cap before writing.
      const newTopics = analysis.topics.slice(0, LIMITS.MAX_TOPICS_PER_COURSE);
      if (mode === "append") {
        // Append: keep existing topics, create the new ones with `order`
        // continuing after the current max order for this course.
        const last = await prisma.topic.findFirst({
          where: { courseId },
          orderBy: { order: "desc" },
          select: { order: true },
        });
        const base = (last?.order ?? -1) + 1;
        await prisma.topic.createMany({
          data: newTopics.map((t, i) => ({
            courseId,
            title: t.title,
            effort: Math.max(0.5, t.estMinutes / MINUTES_PER_EFFORT),
            order: base + i,
          })),
        });
      } else {
        // Replace topics with the content-derived ones (effort from estimated time).
        // Atomic: a crash between delete and create must not destroy all topics.
        await prisma.$transaction([
          prisma.topic.deleteMany({ where: { courseId } }),
          prisma.topic.createMany({
            data: newTopics.map((t, i) => ({
              courseId,
              title: t.title,
              effort: Math.max(0.5, t.estMinutes / MINUTES_PER_EFFORT),
              order: i,
            })),
          }),
        ]);
      }
      n = newTopics.length;
      // Stored category: the user's explicit choice wins; if they left it on a
      // value we can't read, fall back to the auto-classifier (filename
      // heuristics, then the AI-derived category).
      const category = chosenType ?? classifyFile(file.name, analysis.category);
      await prisma.moduleFile.create({
        data: {
          courseId,
          filename: file.name,
          mimeType: file.type || null,
          sizeBytes: file.size,
          extractedChars: text.length,
          category,
          analysis: JSON.stringify({
            summary: analysis.summary,
            concepts: analysis.concepts,
            prerequisites: analysis.prerequisites,
          }),
        },
      });
      await prisma.course.update({ where: { id: courseId }, data: { aiOptimized: true } });
      await regeneratePlan(courseId);
      // New material rebuilt the topics + plan — refresh Today (and the course
      // page) so the new schedule shows immediately without a manual reload.
      revalidatePath("/today");
      revalidatePath(`/courses/${courseId}`);
      result = "analyzed";
    }
  } catch (e) {
    logActionError("analyzeModuleUpload", e);
    if (e instanceof Error && e.message.includes("PPTX")) {
      result = "analyze-unsupported";
    } else {
      // Tell apart "AI isn't set up" / "AI was unreachable" from a real failure
      // (e.g. an unreadable file) so the banner reason is accurate.
      result = aiFailureBanner(e, "analyze-error");
    }
  }
  redirect(`/courses/${courseId}?msg=${result}&n=${n}`);
}

/**
 * Remove an uploaded module file (its stored content analysis) from a course.
 * The upload's topics/plan are NOT rebuilt — deleting the file just drops the
 * stored record, mirroring how deleting a deadline leaves the rest intact.
 * Ownership-scoped: the owning courseId is derived from the row (never trusted
 * from the form), so a guessed moduleFileId is a silent no-op.
 */
export async function deleteModuleFile(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  try {
    id = requireId(formData.get("moduleFileId"), "Module file");
  } catch {
    return;
  }
  // Scoped delete: only removes the file if its course is owned; the returned
  // courseId (or "" no-op) drives revalidation of the right course page.
  const courseId = await deleteOwnedModuleFile(userId, id);
  revalidatePath(`/courses/${courseId ?? ""}`);
}

/** Delete a course (cascades to its topics + study blocks). */
export async function deleteCourse(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) redirect("/courses?msg=rate-limited");
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  // Scoped delete: a non-owner's id is a no-op, never another user's course.
  await deleteOwnedCourse(userId, id);
  redirect("/courses");
}

/** AI progress: read a plain-language status, mark matching topics done, replan. */
export async function applyProgress(formData: FormData) {
  const userId = await getCurrentUserId();
  let id: string;
  let status: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
    status = requireText(formData.get("status"), "Status", 5000);
  } catch {
    return;
  }
  if (!rateLimitOK("AI", id)) redirect(`/courses/${id}?msg=rate-limited`);

  // Ownership-scoped: only load (and later mutate) a course the current user owns.
  const course = await prisma.course.findFirst({
    where: { id, userId },
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
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) {
    return { ok: false, error: "Too many changes too fast — give it a minute and try again." };
  }
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
    const owned = await updateOwnedCourse(userId, id, {
      name,
      examDate: toUTCDate(examDate),
      studyDays,
    });
    if (!owned) return { ok: false, error: "Course not found." };
    await regeneratePlan(id);
    revalidatePath("/courses");
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save — please try again." };
  }
}

/** Edit a course's exam date / capacity, then rebuild the plan around it. */
export async function updateCourse(formData: FormData) {
  const userId = await getCurrentUserId();
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimitOK("MUTATION", userId)) redirect(`/courses/${id}?msg=rate-limited`);
  let examDate: string | null;
  try {
    examDate = optionalDate(formData.get("examDate"), "Exam date", todayISO());
  } catch {
    redirect(`/courses/${id}?msg=past-exam`);
  }
  const studyDays = sanitizeStudyDays(formData.getAll("studyDays").map(String));

  const owned = await updateOwnedCourse(userId, id, {
    ...(examDate ? { examDate: toUTCDate(examDate) } : {}),
    studyDays,
  });
  if (!owned) redirect("/courses");
  await regeneratePlan(id);
  redirect(`/courses/${id}?msg=saved`);
}

/** "I fell behind" — redistribute remaining work across the days left. */
export async function healCourse(formData: FormData) {
  const userId = await getCurrentUserId();
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimitOK("MUTATION", userId)) redirect(`/courses/${id}?msg=rate-limited`);
  if (!(await ownsCourse(userId, id))) redirect("/courses");

  // Rebuilding can fail (DB hiccup); surface it instead of a raw 500. redirect()
  // stays OUTSIDE the try since it throws NEXT_REDIRECT.
  let outcome: string;
  try {
    const { isOverloaded } = await healCoursePlan(id);
    outcome = isOverloaded ? "healed-over" : "healed";
  } catch (e) {
    logActionError("healCourse", e);
    outcome = "heal-failed";
  }
  redirect(`/courses/${id}?msg=${outcome}`);
}

/** Log a finished focus session (Pomodoro) against a block — feeds adaptive pacing. */
export async function logFocus(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
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
  // Scoped: only a block whose course the current user owns is logged against.
  const block = await findOwnedBlock(userId, id);
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
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return;
  }
  const path = str(formData.get("revalidate")) || "/today";
  // Scoped: a non-owner toggling another user's block id is a silent no-op.
  const block = await findOwnedBlock(userId, id);
  if (block) {
    await prisma.studyBlock.update({
      where: { id },
      data: { completed: !block.completed },
    });
  }
  revalidatePath(path);
}

/**
 * Move a study block to a different day (drag-to-reschedule on the dashboard).
 * Ownership-scoped via findOwnedBlock so a guessed blockId can never move
 * another user's block. The date is a YYYY-MM-DD string stored at UTC midnight,
 * matching how every other study block date is persisted.
 */
export async function rescheduleBlock(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  let dateISO: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
    // Allow moving a block into the past ("I'll catch up earlier" / drag back).
    dateISO = requireDate(formData.get("date"), "Date", todayISO(), { allowPast: true });
  } catch {
    return;
  }
  // Scoped: a non-owner moving another user's block id is a silent no-op.
  const block = await findOwnedBlock(userId, id);
  if (block) {
    await prisma.studyBlock.update({
      where: { id },
      data: { date: toUTCDate(dateISO) },
    });
    revalidatePath("/dashboard");
  }
}

const CONFIDENCE = new Set(["solid", "practice", "struggling"]);

/**
 * Save a topic's self-rated confidence (solid | practice | struggling, or "" to
 * clear) and re-adapt the plan immediately: struggling earns more/earlier spaced
 * reviews, solid fewer/later. Set once per topic (from the course-detail list),
 * not per study session. Ownership-scoped — the owning courseId is derived from
 * the row, never trusted from the form; junk values are a silent no-op.
 */
export async function setTopicConfidence(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  try {
    id = requireId(formData.get("topicId"), "Topic");
  } catch {
    return;
  }
  const raw = str(formData.get("confidence"));
  const confidence = raw === "" ? null : CONFIDENCE.has(raw) ? raw : undefined;
  if (confidence === undefined) return; // junk → ignore, never persist garbage
  const topic = await findOwnedTopic(userId, id);
  if (topic) {
    await prisma.topic.update({ where: { id }, data: { confidence } });
    await regeneratePlan(topic.courseId);
    revalidatePath(`/courses/${topic.courseId}`);
  }
}

/** Add a dated deliverable (homework, lab report, project) to a course. */
export async function addAssignment(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
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
  // Ownership-scoped: never attach an assignment to another user's course.
  if (!(await ownsCourse(userId, courseId))) return;
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
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  try {
    id = requireId(formData.get("assignmentId"), "Assignment");
  } catch {
    return;
  }
  const path = str(formData.get("revalidate"));
  // Scoped: a non-owner's assignment id resolves to null → no-op.
  const a = await findOwnedAssignment(userId, id);
  if (a) {
    await prisma.assignment.update({ where: { id }, data: { done: !a.done } });
  }
  revalidatePath(path || `/courses/${a?.courseId ?? ""}`);
}

/** Remove an assignment. */
export async function deleteAssignment(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  let courseId: string;
  try {
    id = requireId(formData.get("assignmentId"), "Assignment");
    courseId = requireId(formData.get("courseId"), "Course");
  } catch {
    return;
  }
  // Scoped delete: only removes the assignment if its course is owned.
  await deleteOwnedAssignment(userId, id);
  revalidatePath(`/courses/${courseId}`);
}

/** Record (or clear) a course's final grade (German scale 1.0–5.0). */
export async function setGrade(formData: FormData) {
  const userId = await getCurrentUserId();
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimitOK("MUTATION", userId)) redirect(`/courses/${id}?msg=rate-limited`);
  const grade = parseGrade(formData.get("grade"));
  if (!(await updateOwnedCourse(userId, id, { grade }))) redirect("/courses");
  redirect(`/courses/${id}?msg=graded`);
}

/** Toggle a topic done/undone, then rebuild the plan so it reflects reality. */
export async function toggleTopic(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  try {
    id = requireId(formData.get("topicId"), "Topic");
    requireId(formData.get("courseId"), "Course");
  } catch {
    return;
  }
  // Scoped: only a topic whose course the current user owns can be toggled. The
  // owning courseId is derived from the row (not trusted from the form), so the
  // replan + revalidate always target the topic's real course.
  const topic = await findOwnedTopic(userId, id);
  if (topic) {
    await prisma.topic.update({ where: { id }, data: { done: !topic.done } });
    await regeneratePlan(topic.courseId);
    revalidatePath(`/courses/${topic.courseId}`);
  }
}

/**
 * Save a topic's free-text study note (autosaved from the course-detail editor).
 * Upserts the single note for that topic; an empty body clears it so we never
 * keep a blank row. Ownership-scoped: a non-owner's (or junk) topicId is a no-op.
 *
 * No `revalidatePath` here on purpose — the editor is the source of truth while
 * the user types (optimistic local state), so revalidating on every autosave
 * would refetch the page and fight the textarea. A later navigation/refresh reads
 * the persisted note normally.
 */
export async function saveNote(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) {
    throw new Error("You're saving a lot quickly — give it a moment and try again.");
  }
  let topicId: string;
  try {
    topicId = requireId(formData.get("topicId"), "Topic");
  } catch {
    return;
  }
  const body = optionalText(formData.get("body"), LIMITS.MAX_NOTE_LENGTH);
  if (body === null) {
    // Emptying the note removes it rather than storing a blank string.
    await deleteOwnedTopicNote(userId, topicId);
    return;
  }
  await upsertOwnedTopicNote(userId, topicId, body);
}

/** Explicitly clear a topic's note (the editor's "Clear note" control). */
export async function deleteNote(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let topicId: string;
  try {
    topicId = requireId(formData.get("topicId"), "Topic");
  } catch {
    return;
  }
  await deleteOwnedTopicNote(userId, topicId);
}
