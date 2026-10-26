import { prisma } from "./db";
import { requireDate, requireText, ValidationError } from "./validate";
import { todayISO } from "./planService";
import { parsePrefs, serializePrefs } from "./timePlacer";
import { hhmmToMinutes } from "./calendarTime";
import { storeMaterial } from "./materials";
import { startQuickStudy } from "./practicalStudy";
import { LIMITS } from "./limits";

/** First-run setup creates useful work after explicitly confirming availability. */
export async function createFirstStudyPlan(userId: string, data: FormData) {
  const name = requireText(data.get("name"), "Course", 100);
  const examDate = requireDate(data.get("examDate"), "Exam date", todayISO());
  if (examDate <= todayISO()) throw new ValidationError("Choose an exam after today.");
  const budget = Number(data.get("dailyBudgetMin"));
  if (!Number.isInteger(budget) || budget < 15 || budget > 360) throw new ValidationError("Choose 15 to 360 minutes per day.");
  const days = [...new Set(data.getAll("studyDays").map(Number))];
  if (!days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new ValidationError("Choose at least one study day.");
  const sourceRef = String(data.get("sourceRef") ?? "").trim();
  if (sourceRef.length > 300) throw new ValidationError("Describe the work in at most 300 characters.");
  const file = data.get("file");
  const upload = file instanceof File && file.size > 0 ? file : null;
  if (!upload && !sourceRef) throw new ValidationError("Add material or describe the pages or exercises to study.");
  const requestId = String(data.get("requestId") ?? "");
  if (!/^[\da-f-]{36}$/i.test(requestId)) throw new ValidationError("Please reopen setup and try again.");
  const id = `start-${userId}-${requestId}`;
  const existing = await prisma.course.findFirst({ where: { id, userId }, select: { id: true, files: { select: { id: true }, take: 1 } } });
  if (existing) return { path: `/courses/${existing.id}${existing.files[0] ? `?prepare=${existing.files[0].id}` : ""}` };
  if (await prisma.course.count({ where: { userId } }) >= LIMITS.MAX_COURSES_PER_USER) throw new ValidationError("Course limit reached.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { preferences: true } });
  const prefs = parsePrefs(user.preferences);
  const dayStartMin = hhmmToMinutes(String(data.get("dayStart") ?? "")) ?? prefs.dayStartMin;
  const dayEndMin = hhmmToMinutes(String(data.get("dayEnd") ?? "")) ?? prefs.dayEndMin;
  if (dayEndMin <= dayStartMin) throw new ValidationError("The study window must end after it starts.");
  await prisma.course.create({ data: { id, userId, name, examDate: new Date(examDate + "T00:00:00Z"), studyDays: days.join(",") } });
  let stored;
  try {
    if (upload) stored = await storeMaterial(userId, id, upload, null);
    await prisma.user.update({ where: { id: userId }, data: { preferences: serializePrefs({ ...prefs, dayStartMin, dayEndMin, dailyBudgetMin: budget }) } });
  } catch (error) {
    await prisma.course.delete({ where: { id } });
    throw error;
  }
  if (stored) return { path: `/courses/${id}?prepare=${stored.id}` };
  const started = await startQuickStudy(userId, { courseId: id, mode: "read", minutes: 30,
    language: data.get("language") === "de" ? "de" : "en", sourceRef });
  return { path: started?.blockId ? `/focus?blockId=${started.blockId}` : `/courses/${id}` };
}
