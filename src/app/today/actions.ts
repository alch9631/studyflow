"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { rebuildSchedule, todayISO } from "@/lib/planService";
import { instantToDayISO, instantToDayMinutes, dayMinutesToInstant } from "@/lib/calendarTime";
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

/**
 * Shift a set of today's incomplete study blocks one day forward (UTC midnight),
 * ownership-scoped through course.userId so guessed ids are silent no-ops. This is
 * the calm, non-destructive primitive behind the "I'm behind" sheet's lighter
 * options — it only re-dates unfinished work, never deletes and never touches
 * completed sessions. Returns how many blocks actually moved.
 */
async function shiftBlocksToTomorrow(
  userId: string,
  where: { kind?: string },
): Promise<number> {
  const today = todayISO();
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);
  const blocks = await prisma.studyBlock.findMany({
    where: {
      date: { gte: start, lt: end },
      completed: false,
      course: { userId },
      ...(where.kind ? { kind: where.kind } : {}),
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      course: { select: { examDate: true } },
    },
  });
  let moved = 0;
  for (const b of blocks) {
    const next = new Date(b.date.getTime() + 86400_000);
    // Never push work onto or past its course's exam day — the scheduler's
    // "everything lands before the exam" invariant. A block that can't legally
    // move simply stays on today (still visible, still doable) rather than
    // being dropped or scheduled after the exam. Both dates are UTC midnight,
    // so a plain timestamp compare is exact.
    if (next.getTime() >= b.course.examDate.getTime()) continue;
    // Keep the time-of-day in sync with the day shift. The calendar derives a
    // timed block's column from startTime, so shifting only `date` would desync
    // it (gone from /today, still rendered in today's calendar column). Re-place
    // at the same local start on the next day, preserving the exact duration
    // (DST-safe via the tz helpers) — mirrors moveBlockToTomorrow.
    let startTime = b.startTime;
    let endTime = b.endTime;
    if (b.startTime && b.endTime) {
      const nextDayISO = instantToDayISO(next);
      startTime = dayMinutesToInstant(nextDayISO, instantToDayMinutes(b.startTime));
      endTime = new Date(startTime.getTime() + (b.endTime.getTime() - b.startTime.getTime()));
    }
    await prisma.studyBlock.update({
      where: { id: b.id },
      data: { date: next, startTime, endTime },
    });
    moved++;
  }
  return moved;
}

/**
 * "Protect today" — the lightest touch in the I'm-behind sheet. Pushes only
 * today's still-open REVIEW sessions to tomorrow, so the day keeps its must-do
 * first-pass study but sheds the optional revision load. Calm, reversible (each
 * block can be pulled back), and never deletes anything.
 */
export async function protectToday() {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) redirect("/today?msg=rate-limited");
  let moved = 0;
  try {
    moved = await shiftBlocksToTomorrow(userId, { kind: "review" });
  } catch (e) {
    logActionError("protectToday", e);
    redirect("/today?msg=behind-failed");
  }
  revalidatePath("/today");
  redirect(`/today?lightened=protect&blocks=${moved}`);
}

/**
 * "Move optional work" — pushes ALL of today's still-open sessions to tomorrow
 * (reviews and lower-priority study alike), clearing today entirely without
 * losing anything. A heavier reset than "Protect today" but lighter than a full
 * respread; completed work survives untouched.
 */
export async function moveOptionalWork() {
  const userId = await getCurrentUserId();
  if (!checkRateLimit("MUTATION", userId)) redirect("/today?msg=rate-limited");
  let moved = 0;
  try {
    moved = await shiftBlocksToTomorrow(userId, {});
  } catch (e) {
    logActionError("moveOptionalWork", e);
    redirect("/today?msg=behind-failed");
  }
  revalidatePath("/today");
  redirect(`/today?lightened=move&blocks=${moved}`);
}
