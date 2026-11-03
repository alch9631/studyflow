"use server";

import { getCurrentUserId } from "@/lib/devUser";
import { enforceRateLimit } from "@/lib/rateLimitPolicy";
import { saveTopicPlanningForUser } from "@/lib/topicPlanningService";
import { ValidationError } from "@/lib/validate";
import { revalidatePath } from "next/cache";

export async function saveTopicPlanning(form: FormData) {
  const userId = await getCurrentUserId();
  enforceRateLimit("MUTATION", userId);
  try {
    const topicId = String(form.get("topicId") ?? "");
    const saved = await saveTopicPlanningForUser(userId, topicId, {
      prerequisites: form.getAll("prerequisites").map(String), importance: form.get("importance"),
      dueDate: form.get("dueDate"), assignmentId: form.get("assignmentId"),
    });
    if (!saved) return { ok: false };
    revalidatePath("/courses"); revalidatePath("/today"); revalidatePath("/calendar");
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, reason: error.message };
    throw error;
  }
}
