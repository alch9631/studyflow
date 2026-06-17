"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { signOut } from "@/auth";

/** End the current Auth.js session and return to the sign-in page. */
export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/** Rotate the calendar subscribe token — invalidates the old webcal URL. */
export async function resetCalendarToken() {
  const userId = await getCurrentUserId();
  // Rotating the token is cheap but security-sensitive; cap it per user.
  if (!checkRateLimit("MUTATION", userId)) redirect("/settings?msg=rate-limited");
  await prisma.user.update({
    where: { id: userId },
    data: { calendarToken: crypto.randomUUID() },
  });
  revalidatePath("/settings");
}
