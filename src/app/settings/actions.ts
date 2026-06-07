"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";

/** Rotate the calendar subscribe token — invalidates the old webcal URL. */
export async function resetCalendarToken() {
  const userId = await getCurrentUserId();
  await prisma.user.update({
    where: { id: userId },
    data: { calendarToken: crypto.randomUUID() },
  });
  revalidatePath("/settings");
}
