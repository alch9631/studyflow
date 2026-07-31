"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { regeneratePlan, healCoursePlan, aiOptimizeCourse, rebuildSchedule, todayISO } from "@/lib/planService";
import { coursePassed } from "@/lib/coursePassed";
import {
  extractSyllabus,
  isSyllabusAIEnabled,
  interpretProgress,
  analyzeModuleContent,
} from "@/lib/syllabus";
import { MINUTES_PER_EFFORT } from "@/lib/planner";
import { classifyFile, isFileCategory, type FileCategory } from "@/lib/fileCategory";
import { resolveUploadMode, topicIdsSafeToDelete } from "@/lib/moduleUpload";
import {
  classifyTextSource,
  UnsupportedFileError,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_LABEL,
} from "@/lib/fileText";
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
  maxFutureISO,
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
 * Serializable result for actions that previously failed via silent `return`.
 * Client callers (optimistic hooks, ValidatedForm) inspect it to show an honest
 * error instead of implying success. Success paths return `{ ok: true }` AFTER
 * their revalidate calls.
 */
export type ActionOutcome =
  | { ok: true }
  | { ok: false; reason: "rate-limited" | "exam-day" | "invalid" | "not-found" };

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
  // A past or too-far-future exam date must NOT hit the error boundary (the
  // typed form would be lost) — redirect back with a specific banner instead.
  let examDate: string;
  try {
    examDate = requireDate(formData.get("examDate"), "Exam date", todayISO());
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    const iso = str(formData.get("examDate"));
    const msg =
      isValidISODate(iso) && iso > maxFutureISO(todayISO()) ? "exam-too-far" : "exam-past";
    redirect(`/courses/new?msg=${msg}`);
  }
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

/**
 * Extract plain text from an uploaded study material (PDF, DOCX, txt, md).
 *
 * The file type is decided FIRST, by the pure policy in fileText.ts, and an
 * unreadable type throws before we touch the bytes — a photo or an archive must
 * never be silently UTF-8 decoded into mojibake and then spent on a model call.
 */
async function extractTextFromFile(file: File): Promise<string> {
  const kind = classifyTextSource(file.name, file.type);
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UnsupportedFileError(`That file is over the ${MAX_UPLOAD_LABEL} upload limit.`);
  }
  const buf = Buffer.from(await file.arrayBuffer());

  if (kind === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      return (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  }
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  return buf.toString("utf-8"); // txt / md
}

/**
 * Build a course from a pasted syllabus AND/OR an uploaded study material
 * (lecture script, PDF, notes). AI extracts the topics + exam date, then plans.
 */
export async function importSyllabus(formData: FormData) {
  const userId = await getCurrentUserId();
  // Redirect-with-banner instead of throwing — a thrown error here lands on the
  // full-page error boundary and loses the typed form.
  // Tightest budget first — an imported document costs the same provider tokens
  // as an uploaded one (see AI_DOCUMENT in rateLimitPolicy.ts).
  if (!rateLimitOK("AI_DOCUMENT", userId) || !rateLimitOK("AI", userId)) {
    redirect("/courses/import?msg=rate-limited");
  }
  let text = longText(formData.get("syllabus"));
  const studyDays = sanitizeStudyDays(formData.getAll("studyDays").map(String));

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    // A rejected file type must come back as a banner on the import form. Left
    // to throw it hits the full-page error boundary and the user loses every
    // field they typed — the same reason the rate-limit check redirects above.
    let fromFile: string;
    try {
      fromFile = await extractTextFromFile(file);
    } catch (e) {
      if (!(e instanceof UnsupportedFileError)) throw e;
      logActionError("importSyllabus.extract", e);
      redirect("/courses/import?msg=import-unsupported");
    }
    text = text ? `${text}\n\n${fromFile}` : fromFile;
  }
  if (!text.trim()) redirect("/courses/import?msg=import-empty");

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
  // Bonus optimization — 2 more model calls (optimize + self-tests), so it
  // spends 2 more AI tokens; the token charged up top only covered extraction.
  //
  // On a free provider tier this is the call that usually can't run: the
  // extraction above just spent most of the per-minute token allowance, and
  // these follow immediately. That is survivable — the deterministic plan is
  // already saved and the course is complete — but it is NOT nothing, so it
  // must not be swallowed. The course page gets `imported-basic`, which says
  // the plan is built but unoptimized and points at the Re-optimize button,
  // instead of silently presenting a lesser plan as the finished article.
  let msg = "";
  if (rateLimitOKTimes("AI", userId, 2)) {
    try {
      msg = (await aiOptimizeCourse(course.id)) ? "" : "imported-basic";
    } catch (e) {
      logActionError("importSyllabus.aiOptimize", e);
      msg = "imported-basic";
    }
  } else {
    msg = "imported-basic";
  }
  redirect(`/courses/${course.id}${msg ? `?msg=${msg}` : ""}`);
}

/**
 * ONE plan action, replacing the old "Optimize with AI" / "I fell behind" pair.
 *
 * Those two buttons sat side by side and confused their own author: the AI path
 * ENDS with `regeneratePlan`, and `healCoursePlan` IS `regeneratePlan` — so
 * "optimize" already did everything "rebuild" did, plus re-judging difficulty
 * and order and writing fresh self-test questions. One button strictly
 * contained the other while looking like an alternative to it.
 *
 * Collapsing them also removes a trap. Making the single button the AI one
 * would mean a student who just wants their week re-spread spends AI budget to
 * get it, and gets nothing at all when that budget is gone. So the order is:
 * re-spread FIRST — free, instant, always works — then tune with AI on top when
 * it's available. The student always gets a better plan; the AI is an upgrade,
 * never a prerequisite.
 */
export async function refreshPlan(formData: FormData) {
  const userId = await getCurrentUserId();
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimitOK("MUTATION", userId)) redirect(`/courses/${id}?msg=rate-limited`);
  if (!(await ownsCourse(userId, id))) redirect("/courses");

  // Step 1 — the deterministic re-spread. This is the part that must not fail.
  let outcome: string;
  try {
    await healCoursePlan(id);
    outcome = "plan-refreshed";
  } catch (e) {
    logActionError("refreshPlan.respread", e);
    redirect(`/courses/${id}?msg=heal-failed`);
  }

  // Step 2 — optional AI tuning on top (2 model calls: optimize + self-tests).
  // Every failure here is survivable: the plan from step 1 is already saved, so
  // we keep the honest "refreshed" outcome rather than reporting a failure for
  // work the student did receive.
  if (isSyllabusAIEnabled() && rateLimitOKTimes("AI", userId, 2)) {
    try {
      if (await aiOptimizeCourse(id)) outcome = "plan-tuned";
    } catch (e) {
      logActionError("refreshPlan.aiOptimize", e);
    }
  }

  revalidatePath("/today");
  revalidatePath(`/courses/${id}`);
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
  // Two budgets, tightest first. AI_DOCUMENT reflects the PROVIDER's per-minute
  // token allowance — one whole document nearly fills a free tier's — so it is
  // checked before an AI token is spent; without it a user stays inside our
  // limit while the provider rejects the call, and the banner blames the AI for
  // a limit we could have named ourselves.
  if (!rateLimitOK("AI_DOCUMENT", userId) || !rateLimitOK("AI", userId)) {
    redirect(`/courses/${courseId}?msg=rate-limited`);
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/courses/${courseId}?msg=analyze-nofile`);
  }

  // The user explicitly picks the document type in the upload form (pre-filled
  // with the filename auto-detect). We honour their choice if it's a valid
  // category; an empty/unknown value falls back to the auto-detect below.
  const docTypeRaw = formData.get("docType");
  const chosenType: FileCategory | null = isFileCategory(docTypeRaw) ? docTypeRaw : null;

  // Append vs replace — replace is destructive and must be opted into; see
  // lib/moduleUpload for why the default is additive.
  const mode = resolveUploadMode(str(formData.get("mode")));

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
        // done/confidence come along so the replace path can tell a topic the
        // student has actually worked on from a purely AI-derived one.
        select: { id: true, title: true, order: true, done: true, confidence: true },
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
          // Skip topics the course already has: re-uploading the same file, or two
          // materials covering the same chapter, would otherwise grow a duplicate
          // set and double-count that work in the plan.
          const newTopics = analysis.topics
            .filter((t) => !byTitle.has(t.title.trim().toLowerCase()))
            .slice(0, room);
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
          // Even an explicit replace must not destroy the student's own work. A
          // topic they marked done, rated, wrote a note on, or already studied
          // carries history the analysis of one file knows nothing about — and
          // deleting it cascades the note away and orphans completed StudyBlocks.
          // Those survive (re-ordered after the freshly analysed set); only
          // untouched, purely AI-derived topics are actually removed.
          const dropped = existing.filter((tp) => !keep.has(tp.id));
          const droppedIds = dropped.map((tp) => tp.id);
          let noted: { topicId: string }[] = [];
          let studied: { topicId: string }[] = [];
          if (droppedIds.length) {
            noted = await tx.note.findMany({
              where: { topicId: { in: droppedIds } },
              select: { topicId: true },
            });
            studied = await tx.studyBlock.findMany({
              where: { topicId: { in: droppedIds }, completed: true },
              select: { topicId: true },
            });
          }
          const removedIds = topicIdsSafeToDelete(
            dropped,
            noted.map((nt) => nt.topicId),
            studied.map((sb) => sb.topicId),
          );
          if (removedIds.length) {
            await tx.topic.deleteMany({ where: { id: { in: removedIds } } });
          }
          // Survivors keep their data and sit after the freshly analysed set.
          const removedSet = new Set(removedIds);
          let tail = newTopics.length;
          for (const tp of dropped) {
            if (!removedSet.has(tp.id)) {
              await tx.topic.update({ where: { id: tp.id }, data: { order: tail++ } });
            }
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
            // examQuestions rides along in the same JSON blob (no migration):
            // for a past/mock exam the analysis pass already drafts practice
            // questions from the paper, and this is where they live until the
            // student opens the mock exam. Empty for every other material.
            analysis: JSON.stringify({
              summary: analysis.summary,
              concepts: analysis.concepts,
              prerequisites: analysis.prerequisites,
              examQuestions: analysis.examQuestions,
            }),
          },
        });
        await tx.course.update({ where: { id: courseId }, data: { aiOptimized: true } });
      });
      result = "analyzed";
    } else {
      // The model answered, it just found nothing plannable (a cover sheet, a
      // scanned page with no text layer, a formula-only handout). That is NOT
      // "analyze-error" — nothing failed, and telling the student the file was
      // unreadable when it was read fine sends them hunting the wrong problem.
      result = "analyze-notopics";
    }
  } catch (e) {
    logActionError("analyzeModuleUpload", e);
    if (e instanceof UnsupportedFileError) {
      // Rejected by our own accept policy — no model call was ever made, so
      // this must never be reported as an AI failure.
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
    // The model gets each topic's CURRENT done state and returns only CHANGES —
    // so an update that doesn't mention a finished topic can never un-mark it
    // (that used to revert every completed topic and reschedule finished work).
    const updates = await interpretProgress(
      course.topics.map((t) => ({ title: t.title, done: t.done })),
      status,
    );
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
    // Distinguish "in the past" from "more than 2 years out" so the banner
    // doesn't claim a 2032 date is in the past.
    const iso = str(formData.get("examDate"));
    const msg =
      isValidISODate(iso) && iso > maxFutureISO(todayISO()) ? "exam-too-far" : "past-exam";
    redirect(`/courses/${id}?msg=${msg}`);
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
 * time pair returns an {@link ActionOutcome} so the caller can surface it.
 *
 * UNSCHEDULING: when `clear` = "1", the block's startTime/endTime are nulled
 * (it keeps its day and returns to the untimed pool) — ownership + rate limit
 * still enforced, `date`/`start`/`end` are ignored on this path.
 */
export async function updateBlockTime(formData: FormData): Promise<ActionOutcome> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { ok: false, reason: "rate-limited" };
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return { ok: false, reason: "invalid" };
  }

  // Unschedule: drop the block's time-of-day, keep its day.
  if (str(formData.get("clear")) === "1") {
    const block = await findOwnedBlock(userId, id);
    if (!block) return { ok: false, reason: "not-found" };
    await prisma.studyBlock.update({
      where: { id },
      data: { startTime: null, endTime: null },
    });
    revalidatePath("/calendar");
    return { ok: true };
  }

  let dateISO: string;
  try {
    // A block can legitimately be scheduled on a past day (catch-up sessions).
    dateISO = requireDate(formData.get("date"), "Date", todayISO(), { allowPast: true });
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const startRaw = str(formData.get("start"));
  const endRaw = str(formData.get("end"));
  const start = new Date(startRaw);
  const end = new Date(endRaw);
  // Reject junk ISO strings before they become Invalid Dates in the write.
  if (!startRaw || !endRaw || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, reason: "invalid" };
  }

  // Validate the time pair on its local day: positive length, no cross-midnight.
  // endMin is measured from the SAME local midnight as start (so an end that has
  // rolled past midnight reads as >1440 and is caught as cross-midnight, not
  // mistaken for an earlier same-day time).
  const startMin = instantToDayMinutes(start);
  const endMin = startMin + Math.round((end.getTime() - start.getTime()) / 60000);
  const check = checkBlockTimes(startMin, endMin);
  if (!check.ok) return { ok: false, reason: "invalid" };

  // The stored day and the start instant must agree: day-granular views read
  // `date` while the calendar derives a timed block's column from `startTime`,
  // so a mismatched pair would make the block appear on TWO different days.
  if (instantToDayISO(start) !== dateISO) return { ok: false, reason: "invalid" };

  // Scoped: a non-owner moving another user's block id resolves to not-found.
  const block = await findOwnedBlock(userId, id);
  if (!block) return { ok: false, reason: "not-found" };
  await prisma.studyBlock.update({
    where: { id },
    data: { date: toUTCDate(dateISO), startTime: start, endTime: end },
  });
  revalidatePath("/calendar");
  return { ok: true };
}

const CONFIDENCE = new Set(["solid", "practice", "struggling"]);

/**
 * Save a topic's self-rated confidence (solid | practice | struggling, or "" to
 * clear) and re-adapt the plan immediately: struggling earns more/earlier spaced
 * reviews, solid fewer/later. Set once per topic (from the course-detail list),
 * not per study session. Ownership-scoped — the owning courseId is derived from
 * the row, never trusted from the form. Returns an {@link ActionOutcome}.
 */
export async function setTopicConfidence(formData: FormData): Promise<ActionOutcome> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { ok: false, reason: "rate-limited" };
  let id: string;
  try {
    id = requireId(formData.get("topicId"), "Topic");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  const raw = str(formData.get("confidence"));
  const confidence = raw === "" ? null : CONFIDENCE.has(raw) ? raw : undefined;
  // Junk → reject, never persist garbage.
  if (confidence === undefined) return { ok: false, reason: "invalid" };
  const topic = await findOwnedTopic(userId, id);
  if (!topic) return { ok: false, reason: "not-found" };
  await prisma.topic.update({ where: { id }, data: { confidence } });
  await regeneratePlan(topic.courseId);
  revalidatePath(`/courses/${topic.courseId}`);
  return { ok: true };
}

/**
 * Add a dated deliverable (homework, lab report, project) to a course.
 * Returns an {@link ActionOutcome} so the form can distinguish a real save from
 * a rejected one (a silent `return` here used to toast "Deadline added." while
 * nothing was saved — e.g. a due date past the +2y bound).
 */
export async function addAssignment(formData: FormData): Promise<ActionOutcome> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { ok: false, reason: "rate-limited" };
  let courseId: string;
  let title: string;
  let dueDate: string;
  try {
    courseId = requireId(formData.get("courseId"), "Course");
    title = requireText(formData.get("title"), "Assignment title");
    // Deliverables can legitimately be logged with a past due date.
    dueDate = requireDate(formData.get("dueDate"), "Due date", todayISO(), { allowPast: true });
  } catch {
    return { ok: false, reason: "invalid" };
  }
  // Ownership-scoped: never attach an assignment to another user's course.
  if (!(await ownsCourse(userId, courseId))) return { ok: false, reason: "not-found" };
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
  return { ok: true };
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

/**
 * Record a course's exam result: the final grade (German scale 1.0–5.0), the
 * "Modul bestanden (ohne Note)" flag for unbenotete pass/fail modules, or both
 * cleared. When the saved result flips the course between passed and not-passed
 * (see {@link coursePassed}), the plan is rebuilt so a passed module's pending
 * sessions disappear immediately — and come back if the result is cleared or a
 * 5.0 records a failed attempt (a retake is coming).
 */
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
  // Unchecked checkboxes are simply absent from FormData, so absence = false.
  const passed = str(formData.get("passed")) === "1";
  // Read the prior state (ownership-scoped) so we only pay for a global rebuild
  // when the passed-ness actually flips — editing a 2.0 to a 1.7 shouldn't
  // delete-and-recreate every course's plan.
  const prior = await prisma.course.findFirst({
    where: { id, userId },
    select: { grade: true, passed: true },
  });
  if (!prior) redirect("/courses");
  if (!(await updateOwnedCourse(userId, id, { grade, passed }))) redirect("/courses");
  if (coursePassed(prior) !== coursePassed({ grade, passed })) {
    try {
      await rebuildSchedule(userId);
    } catch (e) {
      // The result itself saved; a replan hiccup must not claim it didn't.
      logActionError("setGrade.rebuildSchedule", e);
    }
    revalidatePath("/today");
    revalidatePath("/calendar");
    revalidatePath("/courses");
  }
  redirect(`/courses/${id}?msg=graded`);
}

/**
 * One-tap "Modul bestanden" — mark a course as passed/complete (or undo it).
 * The visible action behind the course-page header button and the course-card
 * menu item; the result form's checkbox (setGrade) stores the same flag. When
 * the passed-ness actually flips, the plan is rebuilt so the module's pending
 * sessions disappear immediately (bestanden) or come back (undo). The numeric
 * grade is left untouched either way.
 */
export async function setCoursePassed(formData: FormData) {
  const userId = await getCurrentUserId();
  let id: string;
  try {
    id = requireId(formData.get("courseId"), "Course");
  } catch {
    redirect("/courses");
  }
  if (!rateLimitOK("MUTATION", userId)) redirect(`/courses/${id}?msg=rate-limited`);
  const passed = str(formData.get("passed")) === "1";
  const prior = await prisma.course.findFirst({
    where: { id, userId },
    select: { grade: true, passed: true },
  });
  if (!prior) redirect("/courses");
  if (!(await updateOwnedCourse(userId, id, { passed }))) redirect("/courses");
  if (coursePassed(prior) !== coursePassed({ grade: prior.grade, passed })) {
    try {
      await rebuildSchedule(userId);
    } catch (e) {
      // The flag itself saved; a replan hiccup must not claim it didn't.
      logActionError("setCoursePassed.rebuildSchedule", e);
    }
    revalidatePath("/today");
    revalidatePath("/calendar");
    revalidatePath("/courses");
  }
  redirect(`/courses/${id}?msg=${passed ? "passed" : "passed-cleared"}`);
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
export async function deleteNote(formData: FormData): Promise<ActionOutcome> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { ok: false, reason: "rate-limited" };
  let topicId: string;
  try {
    topicId = requireId(formData.get("topicId"), "Topic");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  await deleteOwnedTopicNote(userId, topicId);
  return { ok: true };
}

/**
 * Today cockpit — "Move to tomorrow": push a single study block forward by one
 * day. Ownership-scoped via findOwnedBlock so a guessed blockId can never move
 * another user's block. The block keeps its time-of-day (if any); only the day
 * shifts +1, stored at UTC midnight like every other block date. Returns an
 * {@link ActionOutcome} — notably "exam-day" when the shift is blocked by the
 * exam invariant, so the UI can say why nothing moved. Revalidates /today.
 */
export async function moveBlockToTomorrow(formData: FormData): Promise<ActionOutcome> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { ok: false, reason: "rate-limited" };
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  // Scoped: a non-owner moving another user's block id resolves to not-found.
  const block = await findOwnedBlock(userId, id);
  if (!block) return { ok: false, reason: "not-found" };
  // Read the block's current day to compute "+1 day" at UTC midnight. The select
  // is scoped through course.userId so this can't read another user's block.
  const row = await prisma.studyBlock.findFirst({
    where: { id, course: { userId } },
    select: { date: true, startTime: true, endTime: true, course: { select: { examDate: true } } },
  });
  if (!row) return { ok: false, reason: "not-found" };
  const next = new Date(row.date.getTime() + 86400_000);
  // Never push work onto or past the course's exam day — the scheduler's
  // "everything lands before the exam" invariant (mirrors shiftBlocksToTomorrow).
  // Both dates are UTC midnight, so a plain timestamp compare is exact.
  if (next.getTime() >= row.course.examDate.getTime()) {
    return { ok: false, reason: "exam-day" };
  }
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
  return { ok: true };
}

/**
 * Today cockpit — "Quick note" on a block: save free-text to the block's TOPIC
 * note (StudyBlock has no note column; the note lives on the owning topic, the
 * same store the course-detail note editor uses). Ownership-scoped: the block's
 * topicId is derived from the row (never trusted from the form) and the upsert is
 * itself owner-checked, so a guessed blockId resolves to not-found. An empty body
 * clears the note. Revalidates /today so the saved state reflects on reload.
 * Returns an {@link ActionOutcome} so the note UI can surface a failed save.
 */
export async function saveBlockNote(formData: FormData): Promise<ActionOutcome> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { ok: false, reason: "rate-limited" };
  let id: string;
  try {
    id = requireId(formData.get("blockId"), "Block");
  } catch {
    return { ok: false, reason: "invalid" };
  }
  // Ownership-scoped read of the block's owning topic (via course.userId).
  const row = await prisma.studyBlock.findFirst({
    where: { id, course: { userId } },
    select: { topicId: true },
  });
  if (!row) return { ok: false, reason: "not-found" };
  let body: string | null;
  try {
    body = optionalText(formData.get("body"), LIMITS.MAX_NOTE_LENGTH);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (body === null) {
    await deleteOwnedTopicNote(userId, row.topicId);
  } else {
    await upsertOwnedTopicNote(userId, row.topicId, body);
  }
  revalidatePath("/today");
  return { ok: true };
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
): Promise<{ placed: number; unplaced: number; rateLimited: boolean }> {
  const userId = await getCurrentUserId();
  if (!rateLimitOK("MUTATION", userId)) return { placed: 0, unplaced: 0, rateLimited: true };

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

    // DST guard: converting day-minutes to instants can collapse a placement
    // that straddles a spring-forward gap (Europe/Berlin) into start >= end;
    // persisting start == end renders as a 24h block on the calendar. Drop any
    // zero-or-negative-length placement into the unplaced count instead.
    const persistable = placed
      .map((p) => ({
        id: p.id,
        startTime: dayMinutesToInstant(dayISO, p.startMin),
        endTime: dayMinutesToInstant(dayISO, p.endMin),
      }))
      .filter((p) => p.endTime.getTime() > p.startTime.getTime());
    unplacedTotal += placed.length - persistable.length;
    if (persistable.length === 0) continue;

    // Persist the day's placements in one transaction: each placed block gets its
    // start/end as a UTC instant on this local day (Europe/Berlin via calendarTime).
    await prisma.$transaction(
      persistable.map((p) =>
        prisma.studyBlock.update({
          where: { id: p.id },
          data: { startTime: p.startTime, endTime: p.endTime },
        }),
      ),
    );
    placedTotal += persistable.length;
  }

  revalidatePath("/calendar");
  return { placed: placedTotal, unplaced: unplacedTotal, rateLimited: false };
}
