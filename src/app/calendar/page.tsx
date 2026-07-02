import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { instantToDayISO, instantToDayMinutes, MINUTES_PER_DAY } from "@/lib/calendarTime";
import { isValidISODate } from "@/lib/validate";
import WeekCalendar, {
  type CalBlock,
  type CalLecture,
  type CalExam,
} from "./WeekCalendar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Calendar",
  description: "Drag study blocks onto a time-of-day week view.",
};

// YYYY-MM-DD of a UTC-midnight Date — the serializable day key passed to
// <WeekCalendar/>. The week window below is built in pure UTC day math, so UTC
// getters (not server-local ones) read the intended calendar day back out.
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export default async function CalendarPage({
  searchParams,
}: {
  // Next 15 passes searchParams as a Promise.
  searchParams: Promise<{ week?: string }>;
}) {
  const userId = await getCurrentUserId();
  const now = new Date();
  // "Today" anchors to the calendar's display tz (Europe/Berlin) via
  // instantToDayISO — NOT the server's local tz, which disagrees near midnight
  // on a UTC-hosted server and would mis-highlight "today". The window math
  // below is deliberately NOT tz-independent either: it must run in UTC, since
  // that's how block/exam dates are stored.
  const todayISO = instantToDayISO(now);

  // ── Week window (Mon–Sun) ────────────────────────────────────────────────────
  // `?week=YYYY-MM-DD` picks the week containing that date; anything missing or
  // malformed falls back to the current (Berlin) week. We always normalise to the
  // Monday so the seven-column window is stable regardless of which day was linked.
  // Block/exam `date`s are stored at UTC midnight of their Berlin calendar day, so
  // the window is built with pure UTC day math (same pattern as
  // autoScheduleWeekTimes) — server-local midnights would shift the window on any
  // host west of UTC, dropping Monday's rows and leaking next Monday's in.
  const { week } = await searchParams;
  const anchorISO = week && isValidISODate(week) ? week : todayISO;
  const anchor = new Date(anchorISO + "T00:00:00Z");
  const weekStart = new Date(anchor.getTime() - ((anchor.getUTCDay() + 6) % 7) * 86400_000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);

  const [weekBlocks, lectureRows, examCourses] = await Promise.all([
    prisma.studyBlock.findMany({
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
    }),
    // The user's recurring lectures — shown as fixed grey context blocks so the
    // student sees why a slot is busy. weekday: 0=Sun … 6=Sat.
    prisma.lecture.findMany({
      where: { userId },
      select: { id: true, title: true, weekday: true, startMin: true, endMin: true },
    }),
    // Courses whose exam falls inside the shown week → all-day markers.
    prisma.course.findMany({
      where: { userId, examDate: { gte: weekStart, lt: weekEnd } },
      select: { id: true, name: true, examDate: true },
    }),
  ]);

  const dayISOs = Array.from({ length: 7 }, (_, i) =>
    isoDay(new Date(weekStart.getTime() + i * 86400_000)),
  );
  // Map weekday (0=Sun..6=Sat) → the day's ISO in this week, so lectures land in
  // the right column. dayISOs is Mon→Sun, so weekday 1(Mon)=idx0 … 0(Sun)=idx6.
  const isoForWeekday = (weekday: number) => dayISOs[(weekday + 6) % 7];

  // Serialize to plain objects (no Date / relation objects) for the client island.
  // A block is "timed" when it has both startTime and endTime; its day + start/end
  // minutes are derived in the display tz (Europe/Berlin). Otherwise it's
  // day-granular and sits in the day's Unscheduled lane.
  const blocks: CalBlock[] = weekBlocks.map((b) => {
    const timed = b.startTime != null && b.endTime != null;
    const startMin = timed ? instantToDayMinutes(b.startTime!) : null;
    let endMin = timed ? instantToDayMinutes(b.endTime!) : null;
    // A block ending at exactly local midnight reads back as 0 on the NEXT day;
    // represent it as 1440 on the start day so the grid renders its true height
    // (mirrors dayMinutesToInstant's 1440 → next-day-00:00 write path).
    if (startMin != null && endMin != null && endMin <= startMin) endMin += MINUTES_PER_DAY;
    return {
      id: b.id,
      // Day-granular blocks bucket by their stored date, read in the display tz so
      // they share the same column basis as timed blocks (which use startTime).
      dayISO: timed ? instantToDayISO(b.startTime!) : instantToDayISO(b.date),
      startMin,
      endMin,
      topicTitle: b.topicTitle,
      minutes: b.minutes,
      kind: b.kind,
      courseId: b.course.id,
      courseName: b.course.name,
      completed: b.completed,
    };
  });

  const lectures: CalLecture[] = lectureRows.map((l) => ({
    id: l.id,
    dayISO: isoForWeekday(l.weekday),
    startMin: l.startMin,
    endMin: l.endMin,
    title: l.title,
  }));

  // Exam dates are stored at UTC midnight; read the day in the calendar's display
  // tz (Europe/Berlin) so the marker lands in the same column the grid uses.
  const exams: CalExam[] = examCourses.map((c) => ({
    courseId: c.id,
    courseName: c.name,
    dayISO: instantToDayISO(c.examDate),
  }));

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 md:px-6">
      <WeekCalendar
        dayISOs={dayISOs}
        todayISO={todayISO}
        weekStartISO={isoDay(weekStart)}
        prevWeekISO={isoDay(new Date(weekStart.getTime() - 7 * 86400_000))}
        nextWeekISO={isoDay(weekEnd)}
        blocks={blocks}
        lectures={lectures}
        exams={exams}
      />
    </main>
  );
}
