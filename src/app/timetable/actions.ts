"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";

/** "10:30" -> 630 minutes from midnight. Returns null if unparseable. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Add a recurring weekly class slot. */
export async function addLecture(formData: FormData) {
  const userId = await getCurrentUserId();
  const title = String(formData.get("title") ?? "").trim();
  const weekday = parseInt(String(formData.get("weekday") ?? ""), 10);
  const startMin = toMinutes(String(formData.get("start") ?? ""));
  const endMin = toMinutes(String(formData.get("end") ?? ""));
  const location = String(formData.get("location") ?? "").trim() || null;
  const courseId = String(formData.get("courseId") ?? "") || null;

  if (title && weekday >= 0 && weekday <= 6 && startMin != null && endMin != null && endMin > startMin) {
    await prisma.lecture.create({
      data: { userId, title, weekday, startMin, endMin, location, courseId },
    });
  }
  revalidatePath("/timetable");
  revalidatePath("/today");
}

/** Remove a class slot. */
export async function deleteLecture(formData: FormData) {
  const id = String(formData.get("lectureId"));
  await prisma.lecture.delete({ where: { id } });
  revalidatePath("/timetable");
  revalidatePath("/today");
}
