"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { regeneratePlan, healCoursePlan } from "@/lib/planService";
import { extractSyllabus } from "@/lib/syllabus";

/** Create a course (+ its topics) and generate the first plan. */
export async function createCourse(formData: FormData) {
  const userId = await getCurrentUserId();

  const name = String(formData.get("name") ?? "").trim();
  const examDate = String(formData.get("examDate") ?? "");
  const minutesPerDay = parseInt(String(formData.get("minutesPerDay") ?? "120"), 10);
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
      minutesPerDay: Number.isNaN(minutesPerDay) ? 120 : minutesPerDay,
      studyDays: studyDays || "1,2,3,4,5",
      userId,
      topics: {
        create: topicLines.map((title, i) => ({ title, order: i })),
      },
    },
  });

  await regeneratePlan(course.id);
  redirect(`/courses/${course.id}`);
}

/** Day 6 — paste a syllabus, let Claude extract the course, then build the plan. */
export async function importSyllabus(formData: FormData) {
  const userId = await getCurrentUserId();
  const text = String(formData.get("syllabus") ?? "").trim();
  const minutesPerDay = parseInt(String(formData.get("minutesPerDay") ?? "120"), 10);
  const studyDays = formData.getAll("studyDays").map(String).join(",") || "1,2,3,4,5";
  if (!text) throw new Error("Paste your syllabus text first");

  const extracted = await extractSyllabus(text);

  // Fall back to ~4 weeks out if the syllabus didn't state an exam date.
  const examDate = extracted.examDate
    ? new Date(extracted.examDate + "T00:00:00Z")
    : new Date(Date.now() + 28 * 86400_000);

  const course = await prisma.course.create({
    data: {
      name: extracted.courseName || "Imported course",
      examDate,
      minutesPerDay: Number.isNaN(minutesPerDay) ? 120 : minutesPerDay,
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
  redirect(`/courses/${course.id}`);
}

/** "I fell behind" — redistribute remaining work across the days left. */
export async function healCourse(formData: FormData) {
  const id = String(formData.get("courseId"));
  await healCoursePlan(id);
  revalidatePath(`/courses/${id}`);
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
