"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { signOut } from "@/auth";
import { str } from "@/lib/validate";
import { hhmmToMinutes, MINUTES_PER_DAY } from "@/lib/calendarTime";
import { parsePrefs, serializePrefs, type Energy } from "@/lib/timePlacer";

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

const ENERGY = new Set<Energy>(["morning", "evening", "any"]);

/**
 * Persist the student's auto-scheduling preferences (study window start/end as
 * HH:MM + energy) into User.preferences (a JSON string — sqlite has no Json
 * type). We merge onto the parsed-existing prefs so a malformed/legacy blob is
 * repaired rather than blindly overwritten, and clamp the window to a same-day,
 * positive-length range; junk inputs fall back to the current/default values.
 */
export async function saveStudyPrefs(formData: FormData) {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) redirect("/settings?msg=rate-limited");

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferences: true },
  });
  const prefs = parsePrefs(existing?.preferences);

  // HH:MM → minutes; keep the current value when a field is missing/malformed.
  const start = hhmmToMinutes(str(formData.get("dayStart"))) ?? prefs.dayStartMin;
  const end = hhmmToMinutes(str(formData.get("dayEnd"))) ?? prefs.dayEndMin;
  const energyRaw = str(formData.get("energy"));
  const energy = ENERGY.has(energyRaw as Energy) ? (energyRaw as Energy) : prefs.energy;

  // Only accept a sane same-day window; otherwise keep the existing one.
  const validWindow = start >= 0 && end <= MINUTES_PER_DAY && end > start;

  await prisma.user.update({
    where: { id: userId },
    data: {
      preferences: serializePrefs({
        dayStartMin: validWindow ? start : prefs.dayStartMin,
        dayEndMin: validWindow ? end : prefs.dayEndMin,
        energy,
      }),
    },
  });
  revalidatePath("/settings");
  redirect("/settings?msg=prefs-saved");
}
