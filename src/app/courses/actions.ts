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
  MAX_TOPIC_TITLE_LENGTH,
} from "@/lib/validate";
import { LIMITS, guardCount, guardCountBy } from "@/lib/limits";
import { checkBlockTimes, instantToDayMinutes, instantToDayISO, dayMinutesToInstant } from "@/lib/calendarTime";
import { placeDayBlocks, parsePrefs } from "@/lib/timePlacer";
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

/**
 * Spend `n` tokens from a category's budget — one per paid model call the
 * follow-up work makes (e.g. `aiOptimizeCourse` = optimize + self-tests = 2).
 * Returns false as soon as the budget runs dry; tokens already taken stay
 * spent, which errs on the cheap side for the next caller.
 */
function rateLimitOKTimes(category: RateLimitCategory, key: string, n: number): boolean {
  for (let i = 0; i < n; i++) {
    if (!rateLimitOK(category, key)) return false;
  }
  return true;
}

/**
 * Sanitize the form-provided `revalidate` path. Forms only ever send the app
 * routes below; anything else (a tampered field) falls back to `fallback` so
 * user input can never revalidate arbitrary cache paths.
 */
function safeRevalidatePath(raw: string, fallback: string): string {
  if (raw === "/today" || raw === "/calendar" || /^\/courses\/[\w-]{1,200}$/.test(raw)) {
    return raw;
  }
  return fallback;
}

/**
 * Resolve a toggle's target state. Prefers the client's explicit `done` field
 * (the optimistic layer knows the intended state, so two rapid taps each carry
 * their own intent instead of racing a read-modify-write flip that loses one);
 * falls back to flipping the stored value for callers that don't send it.
 */
function toggleTarget(formData: FormData, current: boolean): boolean {
  const raw = str(formData.get("done"));
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return !current;
}

/** Create a course (+ its topics) and generate the first plan. */
export async function createCourse(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("COURSE_WRITE", userId)) redirect("/courses?msg=rate-limited");

  const name = requireText(formData.get("name"), "Course name");
  const examDate = requireDate(formData.get("examDate"), "Exam date", todayISO());
  const studyDays = sanitizeStudyDays(formData.getAll("studyDays").map(String));
  // Difficulty dial: integer 1–5, defaulting to 3 (normal) when missing/invalid.
  const difficulty = clampInt(formData.get("difficulty"), 1, 5, 3);
  // Per-line title cap (same bound the AI extraction paths apply): titles are
  // denormalized into every StudyBlock.topicTitle + the ICS export, so one
  // unbounded pasted line must never become a 200k-char title.
  const topicLines = longText(formData.get("topics"))
    .split("\n")
    .map((l) => l.trim().slice(0, MAX_TOPIC_TITLE_LENGTH))
    .filter(Boolean)
    .slice(0, LIMITS.MAX_TOPICS_PER_COURSE);

  // Defensive caps: don't let a user create unbounded courses/topics.
  guardCount(await prisma.course.count({ where: { userId } }), LIMITS.MAX_COURSES_PER_USER, "courses");

  const course = await prisma.course.create({
    data: {
      name,
      examDate: toUTCDate(examDate),
      studyDays,
      difficulty,
      userId,
      topics: {
        create: topicLines.map((title, i) => ({ title, order: i })),
      },
    },
  });

  await regeneratePlan(course.id);
  // Auto AI-optimize once (difficulty/order/review) — 2 paid model calls, so it
  // must spend from the AI budget like addFromCatalog does, not ride in under
  // the cheaper COURSE_WRITE check. Out of budget → skip the bonus (the
  // deterministic plan already exists). Safe to fail — but log so the failure
  // isn't invisible.
  if (isSyllabusAIEnabled() && rateLimitOKTimes("AI", userId, 2)) {
    try {
      await aiOptimizeCourse(course.id);
    } catch (e) {
      logActionError("createCourse.aiOptimize", e);
    }
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
  // Fallback when a module has no published exam date (seminars, labs,
  // electives) — UTC midnight of today's Berlin calendar day + 12 weeks, like
  // every other stored exam date (a raw Date.now() would keep the time-of-day
  // and render on different days in different views near midnight).
  const defaultExam = new Date(toUTCDate(todayISO()).getTime() + 84 * 86400_000);

  // Phase 1 — the paid AI extractions, OUTSIDE the transaction (a network call
  // must never hold a write transaction open). Each module's topics are
  // prepared up front so phase 2 is a pure batch of writes.
  const prepared: { name: string; examDate: Date; ects: number; code: string; topics: { title: string; effort: number }[] }[] = [];
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
        title: `${t.name} (part ${i + 1})`,
        effort: 1,
      }));
    }
    prepared.push({ name: t.name, examDate: t.examDate ?? defaultExam, ects: t.ects, code: t.code, topics });
  }

  // Phase 2 — create the whole batch in ONE transaction: a mid-batch failure
  // must not leave half the modules imported (a resubmit would then duplicate
  // the committed half). On failure, redirect with a msg instead of surfacing
  // the raw error.
  let createdIds: string[] = [];
  try {
    createdIds = await prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const p of prepared) {
        const course = await tx.course.create({
          data: {
            name: p.name,
            examDate: p.examDate,
            minutesPerDay: 120,
            studyDays: "1,2,3,4,5",
            ects: p.ects,
            sourceCode: p.code,
            userId,
            topics: { create: p.topics.map((tp, i) => ({ title: tp.title, effort: tp.effort, order: i })) },
          },
        });
        ids.push(course.id);
      }
      return ids;
    });
  } catch (e) {
    logActionError("addFromCatalog", e);
    redirect("/catalog?msg=add-failed");
  }

  // Plans are rebuilt AFTER the committed batch; a replan hiccup is logged, not
  // fatal — the courses exist and "I fell behind" can rebuild any plan later.
  try {
    for (const id of createdIds) await regeneratePlan(id);
  } catch (e) {
    logActionError("addFromCatalog.regeneratePlan", e);
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
    throw new Error("PPTX isn't supported yet. Export the slides to PDF and upload that.");
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
    throw new Error("You're importing a lot quickly. Give it a minute and try again.");
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
  // otherwise become an Invalid Date and crash the Prisma write. The fallback is
  // UTC midnight of today's Berlin calendar day + 28 days, like every other
  // stored exam date (a raw Date.now() would keep the time-of-day and render on
  // different days in different views near midnight).
  const examDate =
    extracted.examDate && isValidISODate(extracted.examDate)
      ? new Date(extracted.examDate + "T00:00:00Z")
      : new Date(toUTCDate(todayISO()).getTime() + 28 * 86400_000);

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
  // Bonus optimization — 2 more paid model calls, so it spends 2 more AI tokens
  // (the token charged up top only covered the extraction). Out of budget →
  // skip; the deterministic plan is already saved, so we still land on the
  // course. Log a failure so the swallowed error is diagnosable.
  if (rateLimitOKTimes("AI", userId, 2)) {
    try {
      await aiOptimizeCourse(course.id);
    } catch (e) {
      logActionError("importSyllabus.aiOptimize", e);
    }
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
  // Verify ownership BEFORE the rate-limit check so a non-owner probing this
  // endpoint is bounced without touching the AI budget. The limiter is keyed by
  // userId (NOT courseId — per-course keys would multiply one user's AI budget
  // by their course count). aiOptimizeCourse makes 2 paid model calls
  // (optimize + self-tests), so it charges 2 AI tokens.
  if (!(await ownsCourse(userId, id))) redirect("/courses");
  if (!rateLimitOKTimes("AI", userId, 2)) redirect(`/courses/${id}?msg=rate-limited`);

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
  // Ownership-scoped, and BEFORE the rate-limit check, so a non-owner probing
  // this endpoint is bounced without touching the AI budget. The limiter is
  // keyed by userId (per-course keys would multiply the budget by course count).
  const course = await findOwnedCourse(userId, courseId);
  if (!course) redirect("/courses");
  if (!rateLimitOK("AI", userId)) redirect(`/courses/${courseId}?msg=rate-limited`);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/courses/${courseId}?msg=analyze-nofile`);
  }

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
      const effortFor = (estMinutes: number) => Math.max(0.5, estMinutes / MINUTES_PER_EFFORT);
      // Existing topics keyed by normalised title. A re-analysis that keeps a topic
      // (same title) must preserve that row — and with it the student's confidence
      // rating, note, done flag and questions, plus its id (StudyBlocks reference
      // topicId; recreating topics would orphan completed history from the plan's
      // completion fold, so finished work would get rescheduled).
      const existing = await prisma.topic.findMany({
        where: { courseId },
        select: { id: true, title: true, order: true },
      });
      const byTitle = new Map(existing.map((t) => [t.title.trim().toLowerCase(), t]));
      // Stored category: the user's explicit choice wins; if they left it on a
      // value we can't read, fall back to the auto-classifier (filename
      // heuristics, then the AI-derived category).
      const category = chosenType ?? classifyFile(file.name, analysis.category);

      // ONE transaction for ALL the DB writes (topic reconcile/append, the
      // stored file record, the aiOptimized flag): a throw after the topics
      // were replaced must never report analyze-error while the course was
      // already rewritten — either everything commits or nothing does.
      await prisma.$transaction(async (tx) => {
        if (mode === "append") {
          // Append after the current max order, but bound the TOTAL to the per-course
          // cap (not just the new set — else append could exceed the limit).
          const room = Math.max(0, LIMITS.MAX_TOPICS_PER_COURSE - existing.length);
          const newTopics = analysis.topics.slice(0, room);
          const base = existing.reduce((mx, t) => Math.max(mx, t.order), -1) + 1;
          await tx.topic.createMany({
            data: newTopics.map((t, i) => ({
              courseId,
              title: t.title,
              effort: effortFor(t.estMinutes),
              order: base + i,
            })),
          });
          n = newTopics.length;
        } else {
          // Replace: reconcile the topic set to the content-derived one. A topic whose
          // title still appears is UPDATED in place (keeping its id + user metadata);
          // genuinely-new topics are created; dropped topics are deleted.
          const newTopics = analysis.topics.slice(0, LIMITS.MAX_TOPICS_PER_COURSE);
          const keep = new Set<string>();
          for (let i = 0; i < newTopics.length; i++) {
            const t = newTopics[i];
            const prev = byTitle.get(t.title.trim().toLowerCase());
            const data = { effort: effortFor(t.estMinutes), order: i };
            if (prev && !keep.has(prev.id)) {
              keep.add(prev.id);
              await tx.topic.update({ where: { id: prev.id }, data });
            } else {
              await tx.topic.create({ data: { courseId, title: t.title, ...data } });
            }
          }
          const removedIds = existing.filter((tp) => !keep.has(tp.id)).map((tp) => tp.id);
          if (removedIds.length) {
            await tx.topic.deleteMany({ where: { id: { in: removedIds } } });
          }
          n = newTopics.length;
        }
        await tx.moduleFile.create({
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
        await tx.course.update({ where: { id: courseId }, data: { aiOptimized: true } });
      });
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
  // Replan AFTER the committed write, and treat its failure separately: the
  // analysis genuinely succeeded, so a replan hiccup must not claim it failed —
  // "heal-failed" ("couldn't rebuild the plan, try again") is the honest banner.
  if (result === "analyzed") {
    try {
      await regeneratePlan(courseId);
    } catch (e) {
      logActionError("analyzeModuleUpload.regeneratePlan", e);
      result = "heal-failed";
    }
    // New material rebuilt the topics (+ plan) — refresh Today (and the course
    // page) so the new state shows immediately without a manual reload.
    revalidatePath("/today");
    revalidatePath(`/courses/${courseId}`);
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
  // Ownership-scoped, and BEFORE the rate-limit check, so a non-owner probing
  // this endpoint is bounced without touching the AI budget. The limiter is
  // keyed by userId (per-course keys would multiply the budget by course count).
  const course = await prisma.course.findFirst({
    where: { id, userId },
    select: { topics: { select: { id: true, title: true, done: true } } },
  });
  if (!course) return;
  if (!rateLimitOK("AI", userId)) redirect(`/courses/${id}?msg=rate-limited`);

  // Note: redirect() must live OUTSIDE the try (it throws NEXT_REDIRECT).
  let result = "progress-none";
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
  } catch (e) {
    // Never swallow an AI failure silently (the file's convention — see
    // reoptimizeCourse / analyzeModuleUpload): log it with a greppable tag and
    // map it to an honest banner ("AI not set up" / "AI offline" / generic
    // error) instead of a catch-all "progress-error".
    logActionError("applyProgress", e);
    result = aiFailureBanner(e, "progress-error");
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
    return { ok: false, error: "Too many changes too fast. Give it a minute and try again." };
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
    return { ok: false, error: "Couldn't save. Please try again." };
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
  // Difficulty dial: integer 1–5, defaulting to 3 (normal) when missing/invalid.
  const difficulty = clampInt(formData.get("difficulty"), 1, 5, 3);

  const owned = await updateOwnedCourse(userId, id, {
    ...(examDate ? { examDate: toUTCDate(examDate) } : {}),
    studyDays,
    difficulty,
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
  const path = safeRevalidatePath(str(formData.get("revalidate")), "/today");
  // Scoped: only a block whose course the current user owns is logged against.
  const block = await findOwnedBlock(userId, id);
  if (block) {
    // Atomic increment so two concurrent logs can't drop minutes (the old
    // read-modify-write raced). actualMinutes is nullable and SQL NULL + n stays
    // NULL, so coalesce NULL → 0 first (idempotent, race-safe on its own).
    await prisma.studyBlock.updateMany({
      where: { id, actualMinutes: null },
      data: { actualMinutes: 0 },
    });
    const updated = await prisma.studyBlock.update({
      where: { id },
      data: { actualMinutes: { increment: minutes } },
      select: { actualMinutes: true, minutes: true, completed: true },
    });
    // Completion is judged against the post-increment total, so concurrent logs
    // each see at least their own minutes included. Only ever flips false → true.
    if (!updated.completed && (updated.actualMinutes ?? 0) >= updated.minutes) {
      await prisma.studyBlock.update({ where: { id }, data: { completed: true } });
    }
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
  const path = safeRevalidatePath(str(formData.get("revalidate")), "/today");
  // Scoped: a non-owner toggling another user's block id is a silent no-op.
  const block = await findOwnedBlock(userId, id);
  if (block) {
    await prisma.studyBlock.update({
      where: { id },
      data: { completed: toggleTarget(formData, block.completed) },
    });
  }
  revalidatePath(path);
}

/**
 * Set (or move) a study block's time-of-day from the calendar's drag/keyboard
 * move. `date` is the target day (YYYY-MM-DD); `start`/`end` are ISO instants for
 * the block's start/end on that day. The two times are validated to be same-day,
 * positive-length, and non-cross-midnight via {@link checkBlockTimes} (the
 * calendar is day-columned, so a block can't span past local midnight).
 *
 * Ownership-scoped via findOwnedBlock so a guessed blockId can never move another
 * user's block. The day is stored at UTC midnight, matching every other block
 * date; the times are stored as the supplied instants. A non-owner or an invalid
 * time pair is a silent no-op.
 */
export async function updateBlockTime(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  let dateISO: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
    // A block can legitimately be scheduled on a past day (catch-up sessions).
    dateISO = requireDate(formData.get("date"), "Date", todayISO(), { allowPast: true });
  } catch {
    return;
  }

  const startRaw = str(formData.get("start"));
  const endRaw = str(formData.get("end"));
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  // Reject junk ISO strings before they become Invalid Dates in the write.
  if (!startRaw || !endRaw || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

  // Validate the time pair on its local day: positive length, no cross-midnight.
  // endMin is measured from the SAME local midnight as start (so an end that has
  // rolled past midnight reads as >1440 and is caught as cross-midnight, not
  // mistaken for an earlier same-day time).
  const startMin = instantToDayMinutes(start);
  const endMin = startMin + Math.round((end.getTime() - start.getTime()) / 60000);
  const check = checkBlockTimes(startMin, endMin);
  if (!check.ok) return;

  // The stored day and the start instant must agree: day-granular views read
  // `date` while the calendar derives a timed block's column from `startTime`,
  // so a mismatched pair would make the block appear on TWO different days.
  if (instantToDayISO(start) !== dateISO) return;

  // Scoped: a non-owner moving another user's block id is a silent no-op.
  const block = await findOwnedBlock(userId, id);
  if (block) {
    await prisma.studyBlock.update({
      where: { id },
      data: { date: toUTCDate(dateISO), startTime: start, endTime: end },
    });
    revalidatePath("/calendar");
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
  // Scoped: a non-owner's assignment id resolves to null → no-op.
  const a = await findOwnedAssignment(userId, id);
  if (a) {
    await prisma.assignment.update({
      where: { id },
      data: { done: toggleTarget(formData, a.done) },
    });
  }
  revalidatePath(
    safeRevalidatePath(str(formData.get("revalidate")), `/courses/${a?.courseId ?? ""}`),
  );
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
  // Blank = intentional clear (null); an invalid value (e.g. "6") throws and is
  // rejected here — it must neither wipe the stored grade nor claim "graded".
  let grade: number | null;
  try {
    grade = parseGrade(formData.get("grade"));
  } catch {
    redirect(`/courses/${id}?msg=grade-invalid`);
  }
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
    await prisma.topic.update({
      where: { id },
      data: { done: toggleTarget(formData, topic.done) },
    });
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
    throw new Error("You're saving a lot quickly. Give it a moment and try again.");
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

/**
 * Today cockpit — "Move to tomorrow": push a single study block forward by one
 * day. Ownership-scoped via findOwnedBlock so a guessed blockId can never move
 * another user's block. The block keeps its time-of-day (if any); only the day
 * shifts +1, stored at UTC midnight like every other block date. Junk input is a
 * silent no-op, matching rescheduleBlock. Revalidates /today so the queue re-reads.
 */
export async function moveBlockToTomorrow(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return;
  }
  // Scoped: a non-owner moving another user's block id is a silent no-op.
  const block = await findOwnedBlock(userId, id);
  if (!block) return;
  // Read the block's current day to compute "+1 day" at UTC midnight. The select
  // is scoped through course.userId so this can't read another user's block.
  const row = await prisma.studyBlock.findFirst({
    where: { id, course: { userId } },
    select: { date: true, startTime: true, endTime: true, course: { select: { examDate: true } } },
  });
  if (!row) return;
  const next = new Date(row.date.getTime() + 86400_000);
  // Never push work onto or past the course's exam day — the scheduler's
  // "everything lands before the exam" invariant (mirrors shiftBlocksToTomorrow).
  // Both dates are UTC midnight, so a plain timestamp compare is exact.
  if (next.getTime() >= row.course.examDate.getTime()) return;
  // Keep the time-of-day in sync with the new day. The calendar derives a timed
  // block's day from startTime, so shifting only `date` would desync it (moved on
  // /today, unmoved on the calendar). Re-place at the same local start on the next
  // day, preserving the exact duration (DST-safe via the tz helpers).
  let startTime = row.startTime;
  let endTime = row.endTime;
  if (row.startTime && row.endTime) {
    const nextDayISO = instantToDayISO(next);
    startTime = dayMinutesToInstant(nextDayISO, instantToDayMinutes(row.startTime));
    endTime = new Date(startTime.getTime() + (row.endTime.getTime() - row.startTime.getTime()));
  }
  await prisma.studyBlock.update({ where: { id }, data: { date: next, startTime, endTime } });
  revalidatePath("/today");
  revalidatePath("/calendar");
}

/**
 * Today cockpit — "Quick note" on a block: save free-text to the block's TOPIC
 * note (StudyBlock has no note column; the note lives on the owning topic, the
 * same store the course-detail note editor uses). Ownership-scoped: the block's
 * topicId is derived from the row (never trusted from the form) and the upsert is
 * itself owner-checked, so a guessed blockId is a silent no-op. An empty body
 * clears the note. Revalidates /today so the saved state reflects on reload.
 */
export async function saveBlockNote(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return;
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return;
  }
  // Ownership-scoped read of the block's owning topic (via course.userId).
  const row = await prisma.studyBlock.findFirst({
    where: { id, course: { userId } },
    select: { topicId: true },
  });
  if (!row) return;
  const body = optionalText(formData.get("body"), LIMITS.MAX_NOTE_LENGTH);
  if (body === null) {
    await deleteOwnedTopicNote(userId, row.topicId);
  } else {
    await upsertOwnedTopicNote(userId, row.topicId, body);
  }
  revalidatePath("/today");
}

/**
 * Auto-assign clock times (startTime/endTime) to a week's study blocks. This is a
 * PURELY ADDITIVE placement layer on top of the day-level scheduler: it never
 * changes which day a block is on or how long it is — it just packs the day's
 * already-planned blocks into concrete times inside the student's study window,
 * flowing around their fixed lectures, honouring their energy preference.
 *
 * The week is Mon–Sun (same logic the calendar/dashboard use). `weekStart`
 * (YYYY-MM-DD) is optional — defaults to the current week. Per day we collect the
 * user's blocks on that day (ownership-scoped via course.userId), build `busy`
 * from the user's lectures matching that weekday, load the user's prefs, and call
 * the pure {@link placeDayBlocks}; placed blocks get startTime/endTime persisted
 * as UTC instants (Europe/Berlin) via the calendarTime helpers.
 *
 * Idempotent / non-destructive: only blocks that currently have NO times are
 * (re)placed, so re-running never stomps times the student set by hand on the
 * calendar. Junk input is a silent no-op like rescheduleBlock.
 */
export async function autoScheduleWeekTimes(
  formData: FormData,
): Promise<{ placed: number; unplaced: number }> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { placed: 0, unplaced: 0 };

  // Resolve the week's Monday as a UTC-midnight instant: block `date`s are
  // stored at UTC midnight, so UTC day math keys them exactly regardless of the
  // server's local timezone (server-local math shifted the window and the day
  // keys on hosts west of UTC). An explicit weekStart must be a real ISO date
  // (allowing past/future weeks); anything malformed silently falls back to the
  // week containing the app's "today" (Europe/Berlin, via todayISO) — never a
  // thrown error or a bogus Date in the query.
  const weekStartRaw = str(formData.get("weekStart"));
  const anchorISO = weekStartRaw && isValidISODate(weekStartRaw) ? weekStartRaw : todayISO();
  const anchor = new Date(anchorISO + "T00:00:00Z");
  const monday = new Date(anchor.getTime() - ((anchor.getUTCDay() + 6) % 7) * 86400_000);
  const weekEnd = new Date(monday.getTime() + 7 * 86400_000);

  // Prefs (study window + energy) and the user's recurring lectures (busy).
  const [user, lectures] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { preferences: true } }),
    prisma.lecture.findMany({
      where: { userId },
      select: { weekday: true, startMin: true, endMin: true },
    }),
  ]);
  const prefs = parsePrefs(user?.preferences);
  const window = { startMin: prefs.dayStartMin, endMin: prefs.dayEndMin };

  // The week's blocks (ownership-scoped through course.userId), only the columns
  // the placer needs. We re-place only the timeless ones (both times null) so a
  // re-run is safe and never overwrites hand-set times.
  const weekBlocks = await prisma.studyBlock.findMany({
    where: { course: { userId }, date: { gte: monday, lt: weekEnd } },
    select: { id: true, date: true, minutes: true, startTime: true, endTime: true },
  });

  let placedTotal = 0;
  let unplacedTotal = 0;

  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getTime() + i * 86400_000);
    const dayISO = day.toISOString().slice(0, 10);
    const weekday = day.getUTCDay(); // 0=Sun … 6=Sat, matching Lecture.weekday

    // Blocks on this day that still have no time-of-day → candidates for placement.
    const dayBlocks = weekBlocks.filter(
      (b) =>
        b.date.toISOString().slice(0, 10) === dayISO && b.startTime == null && b.endTime == null,
    );
    if (dayBlocks.length === 0) continue;

    // Busy = this weekday's lectures PLUS blocks already pinned to a time on this
    // day (hand-placed or previously auto-placed) — the placer must flow around
    // both, or fresh placements would overlap what's already on the calendar. A
    // timed block's day is derived from startTime (Europe/Berlin), matching how
    // the calendar columns it; its end is start + duration so a rolled-past-
    // midnight end still reads as a same-day interval.
    const busy = [
      ...lectures
        .filter((l) => l.weekday === weekday)
        .map((l) => ({ startMin: l.startMin, endMin: l.endMin })),
      ...weekBlocks
        .filter(
          (b) => b.startTime != null && b.endTime != null && instantToDayISO(b.startTime) === dayISO,
        )
        .map((b) => {
          const startMin = instantToDayMinutes(b.startTime!);
          const endMin =
            startMin + Math.round((b.endTime!.getTime() - b.startTime!.getTime()) / 60000);
          return { startMin, endMin };
        }),
    ];

    const { placed, unplaced } = placeDayBlocks(
      dayBlocks.map((b) => ({ id: b.id, minutes: b.minutes })),
      busy,
      window,
      prefs.energy,
    );
    unplacedTotal += unplaced.length;
    if (placed.length === 0) continue;

    // Persist the day's placements in one transaction: each placed block gets its
    // start/end as a UTC instant on this local day (Europe/Berlin via calendarTime).
    await prisma.$transaction(
      placed.map((p) =>
        prisma.studyBlock.update({
          where: { id: p.id },
          data: {
            startTime: dayMinutesToInstant(dayISO, p.startMin),
            endTime: dayMinutesToInstant(dayISO, p.endMin),
          },
        }),
      ),
    );
    placedTotal += placed.length;
  }

  revalidatePath("/calendar");
  return { placed: placedTotal, unplaced: unplacedTotal };
}
