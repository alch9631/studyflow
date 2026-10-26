"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { createFirstStudyPlan } from "@/lib/firstStudyPlan";
import { logActionError } from "@/lib/actionErrors";

export async function startStudyPlan(data: FormData) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("COURSE_WRITE", userId)) return { ok: false };
  let path: string;
  try { path = (await createFirstStudyPlan(userId, data)).path; }
  catch (error) { logActionError("startStudyPlan", error); return { ok: false }; }
  for (const route of ["/today", "/courses", "/calendar", "/settings"]) revalidatePath(route);
  redirect(path);
}
