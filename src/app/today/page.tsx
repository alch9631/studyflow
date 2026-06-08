import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { daysUntil, examCountdownLabel, dueLabel } from "@/lib/dates";
import { toggleBlock, logFocus } from "../courses/actions";
import PomodoroTimer from "@/components/PomodoroTimer";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today" };

type Row = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  actualMinutes: number | null;
  course: { name: string; id: string };
};

function BlockRow({ b }: { b: Row }) {
  const isReview = b.kind === "review";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3">
      <form action={toggleBlock}>
        <input type="hidden" name="blockId" value={b.id} />
        <input type="hidden" name="revalidate" value="/today" />
        <button
          type="submit"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${
            b.completed
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 dark:border-gray-700 hover:border-gray-500"
          }`}
          aria-label={b.completed ? "Mark not done" : "Mark done"}
        >
          {b.completed ? "✓" : ""}
        </button>
      </form>
      <span className="min-w-0 flex-1">
        <span className={`break-words ${b.completed ? "text-gray-400 dark:text-gray-500 line-through" : "font-medium"}`}>
          {isReview ? "🔁 " : ""}
          {b.topicTitle}
        </span>
        <span className="ml-2 break-words text-xs text-gray-400 dark:text-gray-500">
          {isReview ? "review · " : ""}
          {b.course.name}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-sm text-gray-400 dark:text-gray-500">
        {b.actualMinutes ? `${b.actualMinutes}/${b.minutes}` : b.minutes} min
      </span>
      <form action={logFocus} className="shrink-0">
        <input type="hidden" name="blockId" value={b.id} />
        <input type="hidden" name="minutes" value="25" />
        <input type="hidden" name="revalidate" value="/today" />
        <button
          type="submit"
          title="Log a 25-min focus session"
          className="whitespace-nowrap rounded-full border border-gray-300 px-2.5 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          🍅 +25m
        </button>
      </form>
    </div>
  );
}

export default async function TodayPage() {
  const userId = await getCurrentUserId();
  const today = todayISO();
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);

  const blocks = (await prisma.studyBlock.findMany({
    where: { date: { gte: start, lt: end }, course: { userId } },
    include: { course: { select: { name: true, id: true } } },
    orderBy: [{ kind: "asc" }, { minutes: "desc" }],
  })) as Row[];

  let nextDate = "";
  let nextBlocks: Row[] = [];
  if (blocks.length === 0) {
    const next = await prisma.studyBlock.findFirst({
      where: { date: { gte: end }, course: { userId } },
      orderBy: { date: "asc" },
    });
    if (next) {
      nextDate = next.date.toISOString().slice(0, 10);
      const ns = new Date(nextDate + "T00:00:00Z");
      const ne = new Date(ns.getTime() + 86400_000);
      nextBlocks = (await prisma.studyBlock.findMany({
        where: { date: { gte: ns, lt: ne }, course: { userId } },
        include: { course: { select: { name: true, id: true } } },
        orderBy: [{ kind: "asc" }, { minutes: "desc" }],
      })) as Row[];
    }
  }

  // Nearest upcoming exam, for a motivating header line / focus banner.
  const nextExam = await prisma.course.findFirst({
    where: { userId, examDate: { gte: start } },
    orderBy: { examDate: "asc" },
    select: { id: true, name: true, examDate: true },
  });
  const nextExamDays = nextExam ? daysUntil(nextExam.examDate, today) : null;
  const examWeek = nextExamDays !== null && nextExamDays <= 7; // focus mode

  // Today's recurring classes (lectures/tutorials/labs).
  const weekday = new Date(today + "T00:00:00Z").getUTCDay();
  const todaysLectures = await prisma.lecture.findMany({
    where: { userId, weekday },
    orderBy: { startMin: "asc" },
  });

  // Open deadlines due within the next 2 weeks, soonest first.
  const upcomingDeadlines = await prisma.assignment.findMany({
    where: {
      done: false,
      course: { userId },
      dueDate: { lt: new Date(start.getTime() + 14 * 86400_000) },
    },
    orderBy: { dueDate: "asc" },
    take: 6,
    include: { course: { select: { name: true, id: true } } },
  });

  const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
  const doneMin = blocks.filter((b) => b.completed).reduce((s, b) => s + b.minutes, 0);
  const courseCount = new Set(blocks.map((b) => b.course.id)).size;
  const remainingMin = Math.max(0, totalMin - doneMin);

  // Realistic focus time left today: minutes until a 22:00 wind-down (Europe/
  // Berlin), discounted by a focus factor — nobody studies every waking minute.
  const nowParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  const [hh, mm] = nowParts.split(":").map(Number);
  const minutesNow = hh * 60 + mm;
  const CUTOFF = 22 * 60; // 22:00
  const FOCUS_RATIO = 0.6; // ~60% of remaining hours is realistically focused study
  const availableMin = Math.max(0, Math.round((CUTOFF - minutesNow) * FOCUS_RATIO));
  const achievable = remainingMin === 0 || remainingMin <= availableMin;
  const overBy = Math.max(0, remainingMin - availableMin);

  // No plan exists at all (no sessions today, none scheduled ahead, no upcoming
  // exam) → treat as a brand-new user and onboard them, rather than implying a
  // "rest day" they never set up.
  const hasNoPlan =
    blocks.length === 0 &&
    nextBlocks.length === 0 &&
    !nextExam &&
    todaysLectures.length === 0 &&
    upcomingDeadlines.length === 0;

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Today</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {today}
        {blocks.length > 0
          ? ` · ${doneMin}/${totalMin} min done · ${courseCountLabel(courseCount)}`
          : ""}
      </p>
      {nextExam && !examWeek && (
        <Link
          href={`/courses/${nextExam.id}`}
          className="mb-6 mt-1 inline-block text-sm text-gray-500 hover:underline dark:text-gray-400"
        >
          ⏳ Next exam: <span className="font-medium text-gray-700 dark:text-gray-200">{nextExam.name}</span>{" "}
          — {examCountdownLabel(nextExamDays!)}
        </Link>
      )}
      {nextExam && examWeek && (
        <Link
          href={`/courses/${nextExam.id}`}
          className="mb-6 mt-2 block rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 hover:border-red-400 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          <span className="font-semibold">🎯 Focus mode — exam week.</span>{" "}
          <span className="font-medium">{nextExam.name}</span> {examCountdownLabel(nextExamDays!)}.
          Prioritise its sessions today; tap to open the course →
        </Link>
      )}
      {!nextExam && <div className="mb-6" />}

      {todaysLectures.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            🎓 Today&apos;s classes
          </h2>
          <ul className="space-y-2">
            {todaysLectures.map((l) => (
              <li
                key={l.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
              >
                <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300">
                  {fmtClock(l.startMin)}–{fmtClock(l.endMin)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.title}</span>
                  {l.location && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">📍 {l.location}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <PomodoroTimer />

      {upcomingDeadlines.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            📝 Deadlines
          </h2>
          <ul className="space-y-2">
            {upcomingDeadlines.map((a) => {
              const days = daysUntil(a.dueDate, today);
              const urgent = days <= 3;
              return (
                <li key={a.id}>
                  <Link
                    href={`/courses/${a.course.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.title}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">{a.course.name}</span>
                    </span>
                    <span
                      className={`shrink-0 whitespace-nowrap text-xs font-medium ${
                        urgent ? "text-red-600 dark:text-red-400" : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {dueLabel(days)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {blocks.length > 0 && remainingMin > 0 && (
        <div
          aria-live="polite"
          className={`mb-4 rounded-xl border p-4 text-sm ${
            achievable
              ? "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
              : "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          <p className="font-semibold">
            {achievable ? "✅ Today's goal looks achievable" : "⚠️ Today's goal is at risk"}
          </p>
          <p className="mt-1">
            <strong>{fmtDuration(remainingMin)}</strong> of studying left ·{" "}
            about <strong>{fmtDuration(availableMin)}</strong> of realistic focus time before 22:00.
          </p>
          {!achievable && (
            <p className="mt-2">
              You&apos;re ~{fmtDuration(overBy)} over. Recommendation: start now with the top blocks,
              run the 🍅 timer, and let the 🔁 reviews slide to tomorrow if you run out of time —
              StudyFlow will re-plan them around you.
            </p>
          )}
        </div>
      )}

      {blocks.length > 0 ? (
        <ul className="space-y-2">
          {blocks.map((b) => (
            <li key={b.id}>
              <BlockRow b={b} />
            </li>
          ))}
        </ul>
      ) : hasNoPlan ? (
        <EmptyState
          emoji="🚀"
          title="Let's build your study plan"
          description="Add your first course and StudyFlow lays out exactly what to study each day — working backward from your exams."
          actions={[
            { label: "🎓 Browse TUHH modules", href: "/catalog" },
            { label: "✨ Import a syllabus", href: "/courses/import" },
            { label: "✍️ Add a course", href: "/courses/new" },
          ]}
        />
      ) : (
        <div>
          <EmptyState
            emoji="😎"
            title="Nothing scheduled today"
            description="It's not a study day — enjoy the break. Review your courses or get ahead whenever you like."
            actions={[
              { label: "📚 My courses", href: "/courses" },
              { label: "📊 Insights", href: "/insights", variant: "secondary" },
            ]}
          />
          {nextBlocks.length > 0 && (
            <details className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <span>Next up · {nextDate}</span>
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                  {nextBlocks.length}
                </span>
              </summary>
              <ul className="space-y-2 px-3 pb-3">
                {nextBlocks.map((b) => (
                  <li key={b.id}>
                    <BlockRow b={b} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </main>
  );
}

function courseCountLabel(n: number): string {
  return `${n} course${n === 1 ? "" : "s"}`;
}

/** Minutes from midnight -> "10:00". */
function fmtClock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "1h 20m" / "45m" / "0m" */
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
