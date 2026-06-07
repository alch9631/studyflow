"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import {
  str,
  requireText,
  requireWeekday,
  parseTimeToMinutes,
  optionalText,
  optionalId,
  requireId,
} from "@/lib/validate";

/** Add a recurring weekly class slot. */
export async function addLecture(formData: FormData) {
  const userId = await getCurrentUserId();
  let title: string;
  let weekday: number;
  try {
    title = requireText(formData.get("title"), "Class title", 200);
    weekday = requireWeekday(formData.get("weekday"));
  } catch {
    return;
  }
  const startMin = parseTimeToMinutes(str(formData.get("start")));
  const endMin = parseTimeToMinutes(str(formData.get("end")));
  const location = optionalText(formData.get("location"), 200);
  const courseId = optionalId(formData.get("courseId"));

  if (startMin != null && endMin != null && endMin > startMin) {
    await prisma.lecture.create({
      data: { userId, title, weekday, startMin, endMin, location, courseId },
    });
  }
  revalidatePath("/timetable");
  revalidatePath("/today");
}

/** Remove a class slot. */
export async function deleteLecture(formData: FormData) {
  let id: string;
  try {
    id = requireId(formData.get("lectureId"), "Class");
  } catch {
    return;
  }
  await prisma.lecture.delete({ where: { id } });
  revalidatePath("/timetable");
  revalidatePath("/today");
}
