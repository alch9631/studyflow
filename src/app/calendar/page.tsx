import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { instantToDayISO, instantToDayMinutes } from "@/lib/calendarTime";
import WeekCalendar, { type CalBlock } from "./WeekCalendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Calendar",
  description: "Drag study blocks onto a time-of-day week view.",
};

// Local YYYY-MM-DD (zero-padded) — used to bucket day-granular blocks into
// columns and as the serializable day key passed to <WeekCalendar/>. Mirrors the
// dashboard's helper (kept local so the dashboard view stays untouched).
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function CalendarPage() {
  const userId = await getCurrentUserId();

  // ── Week window (Mon–Sun, local time) — same logic as the dashboard ────────
  const now = new Date();
  const back = (now.getDay() + 6) % 7; // days since Monday
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);

  const weekBlocks = await prisma.studyBlock.findMany({
    where: { course: { userId }, date: { gte: weekStart, lt: weekEnd } },
    orderBy: { date: "asc" },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      topicTitle: true,
      minutes: true,
      kind: true,
      completed: true,
      course: { select: { id: true, name: true } },
    },
  });

  const dayISOs = Array.from({ length: 7 }, (_, i) =>
    isoDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
  );

  // Serialize to plain objects (no Date / relation objects) for the client island.
  // A block is "timed" when it has both startTime and endTime; its day + start/end
  // minutes are derived in the display tz (Europe/Berlin). Otherwise it's
  // day-granular and sits in the day's Unscheduled lane.
  const blocks: CalBlock[] = weekBlocks.map((b) => {
    const timed = b.startTime != null && b.endTime != null;
    return {
      id: b.id,
      // For timed blocks the day comes from startTime (the tz-local day it lands
      // on); for day-granular blocks it's the stored `date`.
      dayISO: timed ? instantToDayISO(b.startTime!) : isoDay(b.date),
      startMin: timed ? instantToDayMinutes(b.startTime!) : null,
      endMin: timed ? instantToDayMinutes(b.endTime!) : null,
      topicTitle: b.topicTitle,
      minutes: b.minutes,
      kind: b.kind,
      courseId: b.course.id,
      courseName: b.course.name,
      completed: b.completed,
    };
  });

  return (
    <main className="mx-auto max-w-6xl px-4 py-5">
      <WeekCalendar
        dayISOs={dayISOs}
        todayISO={isoDay(now)}
        weekStartISO={isoDay(weekStart)}
        blocks={blocks}
      />
    </main>
  );
}
