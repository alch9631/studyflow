import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { instantToDayISO, instantToDayMinutes } from "@/lib/calendarTime";
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

// Local YYYY-MM-DD (zero-padded) — used to bucket day-granular blocks into
// columns and as the serializable day key passed to <WeekCalendar/>. Mirrors the
// dashboard's helper (kept local so the dashboard view stays untouched).
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The Monday (local) of the week containing `d`. */
function mondayOf(d: Date): Date {
  const back = (d.getDay() + 6) % 7; // days since Monday
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
}

export default async function CalendarPage({
  searchParams,
}: {
  // Next 15 passes searchParams as a Promise.
  searchParams: Promise<{ week?: string }>;
}) {
  const userId = await getCurrentUserId();
  const now = new Date();

  // ── Week window (Mon–Sun, local time) ──────────────────────────────────────
  // `?week=YYYY-MM-DD` picks the week containing that date; anything missing or
  // malformed falls back to the current week. We always normalise to the Monday
  // so the seven-column window is stable regardless of which day was linked.
  const { week } = await searchParams;
  const anchor =
    week && isValidISODate(week)
      ? (() => {
          const [y, m, d] = week.split("-").map(Number);
          return new Date(y, m - 1, d);
        })()
      : now;
  const weekStart = mondayOf(anchor);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);

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
    isoDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
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
    return {
      id: b.id,
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
    <main className="mx-auto max-w-6xl px-4 py-5">
      <WeekCalendar
        dayISOs={dayISOs}
        todayISO={isoDay(now)}
        weekStartISO={isoDay(weekStart)}
        prevWeekISO={isoDay(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7))}
        nextWeekISO={isoDay(weekEnd)}
        blocks={blocks}
        lectures={lectures}
        exams={exams}
      />
    </main>
  );
}
