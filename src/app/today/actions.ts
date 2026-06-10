"use server";

import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/devUser";
import { rebuildSchedule, todayISO } from "@/lib/planService";
import { assessRecovery } from "@/lib/recovery";
import { checkRateLimit } from "@/lib/rateLimitPolicy";
import { logActionError } from "@/lib/actionErrors";

/**
 * One-tap recovery: respread all unfinished work (including overdue sessions
 * from missed days) across the days left before each exam. Completed sessions
 * are durable history and survive untouched (persistBlocks only swaps the
 * unfinished plan). Redirects back to /today with an honest summary of what
 * changed: how much overdue work was folded back in, and how many courses are
 * now flagged as tight before their exam.
 */
export async function recoverPlan() {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) redirect("/today?msg=rate-limited");

  let moved = 0;
  let minutes = 0;
  let intense = 0;
  try {
    const before = await assessRecovery(userId, todayISO());
    moved = before.overdueSessions;
    minutes = before.overdueMinutes;
    const results = await rebuildSchedule(userId);
    for (const r of results.values()) if (r.isOverloaded) intense++;
  } catch (e) {
    logActionError("recoverPlan", e);
    redirect("/today?msg=recover-failed");
  }
  redirect(`/today?recovered=1&moved=${moved}&min=${minutes}&intense=${intense}`);
}
