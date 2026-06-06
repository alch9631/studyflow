"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { regeneratePlan, healCoursePlan, aiOptimizeCourse } from "@/lib/planService";
import { extractSyllabus, isSyllabusAIEnabled, interpretProgress } from "@/lib/syllabus";

/** Create a course (+ its topics) and generate the first plan. */
export async function createCourse(formData: FormData) {
  const userId = await getCurrentUserId();

  const name = String(formData.get("name") ?? "").trim();
  const examDate = String(formData.get("examDate") ?? "");
  const studyDays = formData.getAll("studyDays").map(String).join(",");
  const topicLines = String(formData.get("topics") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!name || !examDate) {
    throw new Error("Name and exam date are required");
  }

  const course = await prisma.course.create({
    data: {
      name,
      examDate: new Date(examDate + "T00:00:00Z"),
      studyDays: studyDays || "1,2,3,4,5",
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
  const ids = formData.getAll("moduleId").map(String);
  if (ids.length === 0) redirect("/catalog");

  const templates = await prisma.moduleTemplate.findMany({ where: { id: { in: ids } } });
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

/** Extract plain text from an uploaded study material (PDF, txt, md). */
async function extractTextFromFile(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  return buf.toString("utf-8"); // txt / md
}

/**
 * Build a course from a pasted syllabus AND/OR an uploaded study material
 * (lecture script, PDF, notes). AI extracts the topics + exam date, then plans.
 */
export async function importSyllabus(formData: FormData) {
  const userId = await getCurrentUserId();
  let text = String(formData.get("syllabus") ?? "").trim();
  const studyDays = formData.getAll("studyDays").map(String).join(",") || "1,2,3,4,5";

  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const fromFile = await extractTextFromFile(file);
    text = text ? `${text}\n\n${fromFile}` : fromFile;
  }
  if (!text) throw new Error("Paste text or upload a study material first");

  const extracted = await extractSyllabus(text);

  // Fall back to ~4 weeks out if the syllabus didn't state an exam date.
  const examDate = extracted.examDate
    ? new Date(extracted.examDate + "T00:00:00Z")
    : new Date(Date.now() + 28 * 86400_000);

  const course = await prisma.course.create({
    data: {
      name: extracted.courseName || "Imported course",
      examDate,
      studyDays,
      userId,
      topics: {
        create: extracted.topics.map((t, i) => ({
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
  const id = String(formData.get("courseId"));
  let ok = false;
  try {
    ok = await aiOptimizeCourse(id);
  } catch {
    ok = false;
  }
  redirect(`/courses/${id}?msg=${ok ? "optimized" : "optimize-failed"}`);
}

/** Delete a course (cascades to its topics + study blocks). */
export async function deleteCourse(formData: FormData) {
  const id = String(formData.get("courseId"));
  await prisma.course.delete({ where: { id } });
  redirect("/courses");
}

/** AI progress: read a plain-language status, mark matching topics done, replan. */
export async function applyProgress(formData: FormData) {
  const id = String(formData.get("courseId"));
  const status = String(formData.get("status") ?? "").trim();
  if (!status) return;

  const course = await prisma.course.findUnique({ where: { id }, include: { topics: true } });
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

/** Edit a course's exam date / capacity, then rebuild the plan around it. */
export async function updateCourse(formData: FormData) {
  const id = String(formData.get("courseId"));
  const examDate = String(formData.get("examDate") ?? "");
  const studyDays = formData.getAll("studyDays").map(String).join(",");

  await prisma.course.update({
    where: { id },
    data: {
      ...(examDate ? { examDate: new Date(examDate + "T00:00:00Z") } : {}),
      studyDays: studyDays || "1,2,3,4,5",
    },
  });
  await regeneratePlan(id);
  redirect(`/courses/${id}?msg=saved`);
}

/** "I fell behind" — redistribute remaining work across the days left. */
export async function healCourse(formData: FormData) {
  const id = String(formData.get("courseId"));
  const { isOverloaded } = await healCoursePlan(id);
  redirect(`/courses/${id}?msg=${isOverloaded ? "healed-over" : "healed"}`);
}

/** Check off (or uncheck) a single study block — "I did this session". */
export async function toggleBlock(formData: FormData) {
  const id = String(formData.get("blockId"));
  const path = String(formData.get("revalidate") || "/today");
  const block = await prisma.studyBlock.findUnique({ where: { id } });
  if (block) {
    await prisma.studyBlock.update({
      where: { id },
      data: { completed: !block.completed },
    });
  }
  revalidatePath(path);
}

/** Toggle a topic done/undone, then rebuild the plan so it reflects reality. */
export async function toggleTopic(formData: FormData) {
  const id = String(formData.get("topicId"));
  const courseId = String(formData.get("courseId"));
  const topic = await prisma.topic.findUnique({ where: { id } });
  if (topic) {
    await prisma.topic.update({ where: { id }, data: { done: !topic.done } });
    await regeneratePlan(courseId);
  }
  revalidatePath(`/courses/${courseId}`);
}
