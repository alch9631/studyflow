import { prisma } from "./db";
import { dayMinutesToInstant, instantToDayISO, instantToDayMinutes } from "./calendarTime";
import { parsePrefs, placeDayBlocks } from "./timePlacer";
import { isValidISODate } from "./validate";

/** Give unfinished sessions times without moving days or overwriting valid times. */
export async function arrangeCalendarTimes(userId: string, weekStart: string, onlyDay?: string) {
  if (!isValidISODate(weekStart) || (onlyDay !== undefined && !isValidISODate(onlyDay))) return { placed: 0, unplaced: 0 };
  const anchor = new Date(weekStart + "T00:00:00Z");
  const monday = new Date(anchor.getTime() - ((anchor.getUTCDay() + 6) % 7) * 86400_000);
  const weekEnd = new Date(monday.getTime() + 7 * 86400_000);
  if (onlyDay && (onlyDay < monday.toISOString().slice(0, 10) || onlyDay >= weekEnd.toISOString().slice(0, 10))) return { placed: 0, unplaced: 0 };

  return prisma.$transaction(async (tx) => {
    const [user, lectures, blocks] = await Promise.all([
      tx.user.findUnique({ where: { id: userId }, select: { preferences: true } }),
      tx.lecture.findMany({ where: { userId }, select: { weekday: true, startMin: true, endMin: true } }),
      tx.studyBlock.findMany({ where: { course: { userId }, date: { gte: monday, lt: weekEnd } },
        select: { id: true, date: true, minutes: true, completed: true, startTime: true, endTime: true },
        orderBy: [{ date: "asc" }, { id: "asc" }] }),
    ]);
    const prefs = parsePrefs(user?.preferences);
    let placed = 0, unplaced = 0;
    for (let index = 0; index < 7; index++) {
      const day = new Date(monday.getTime() + index * 86400_000), dayISO = day.toISOString().slice(0, 10);
      if (onlyDay && dayISO !== onlyDay) continue;
      const candidates = blocks.filter((b) => !b.completed && b.date.toISOString().slice(0, 10) === dayISO && (b.startTime == null || b.endTime == null));
      if (!candidates.length) continue;
      const busy = [
        ...lectures.filter((l) => l.weekday === day.getUTCDay()).map(({ startMin, endMin }) => ({ startMin, endMin })),
        ...blocks.filter((b) => b.startTime && b.endTime && instantToDayISO(b.startTime) === dayISO).map((b) => {
          const startMin = instantToDayMinutes(b.startTime!);
          return { startMin, endMin: startMin + Math.round((b.endTime!.getTime() - b.startTime!.getTime()) / 60000) };
        }),
      ];
      const result = placeDayBlocks(candidates, busy, { startMin: prefs.dayStartMin, endMin: prefs.dayEndMin }, prefs.energy);
      unplaced += result.unplaced.length;
      for (const slot of result.placed) {
        const startTime = dayMinutesToInstant(dayISO, slot.startMin), endTime = dayMinutesToInstant(dayISO, slot.endMin);
        // Local spring-forward times can collapse to the same instant.
        if (endTime.getTime() - startTime.getTime() !== (slot.endMin - slot.startMin) * 60000 ||
            instantToDayMinutes(startTime) !== slot.startMin ||
            (slot.endMin !== 1440 && instantToDayMinutes(endTime) !== slot.endMin)) { unplaced++; continue; }
        const saved = await tx.studyBlock.updateMany({ where: { id: slot.id, completed: false, course: { userId }, OR: [{ startTime: null }, { endTime: null }] }, data: { startTime, endTime } });
        placed += saved.count;
      }
    }
    return { placed, unplaced };
  }, { timeout: 30_000 });
}
