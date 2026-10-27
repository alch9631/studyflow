"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { addFocusNoteForUser, updateFocusNoteForUser } from "@/lib/focusNotes";
import { ValidationError } from "@/lib/validate";

export async function addFocusNote(input: { id: string; topicId: string; body: string }) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const, reason: "rate" as const };
  try {
    const result = await addFocusNoteForUser(userId, input);
    if (result.ok) revalidatePath("/focus");
    return result;
  } catch (error) { if (error instanceof ValidationError) return { ok: false as const, reason: "invalid" as const }; throw error; }
}

export async function updateFocusNote(input: { id: string; topicId: string; body: string; updatedAt: string }) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) return { ok: false as const, reason: "rate" as const };
  try {
    const result = await updateFocusNoteForUser(userId, input);
    if (result.ok) {
      revalidatePath("/focus");
      if (input.id.startsWith("topic:")) { revalidatePath(`/courses/${result.courseId}`); revalidatePath("/today"); }
    }
    return result;
  } catch (error) { if (error instanceof ValidationError) return { ok: false as const, reason: "invalid" as const }; throw error; }
}
