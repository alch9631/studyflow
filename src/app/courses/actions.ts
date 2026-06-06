"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { regeneratePlan, healCoursePlan } from "@/lib/planService";

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

/** "I fell behind" — redistribute remaining work across the days left. */
export async function healCourse(formData: FormData) {
  const id = String(formData.get("courseId"));
  await healCoursePlan(id);
  revalidatePath(`/courses/${id}`);
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
