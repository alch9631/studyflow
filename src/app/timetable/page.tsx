import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { addLecture, deleteLecture } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Timetable" };

const DAYS = [
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
  { v: 0, label: "Sunday" },
];

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default async function TimetablePage() {
  const userId = await getCurrentUserId();
  const [lectures, courses] = await Promise.all([
    prisma.lecture.findMany({
      where: { userId },
      orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
    }),
    prisma.course.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const byDay = new Map<number, typeof lectures>();
  for (const l of lectures) {
    if (!byDay.has(l.weekday)) byDay.set(l.weekday, []);
    byDay.get(l.weekday)!.push(l);
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-1 text-2xl font-bold">📅 My timetable</h1>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
        Your recurring weekly classes — lectures, tutorials, labs.
      </p>

      {/* Add a class slot */}
      <form
        action={addLecture}
        className="mb-6 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
      >
        <div className="flex flex-wrap gap-3">
          <label className="min-w-0 flex-1 text-sm">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Title</span>
            <input
              name="title"
              required
              placeholder="e.g. Analysis I — Vorlesung"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Day</span>
            <select
              name="weekday"
              defaultValue="1"
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700"
            >
              {DAYS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Start</span>
            <input
              type="time"
              name="start"
              required
              defaultValue="10:00"
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700"
            />
          </label>
          <label className="text-sm">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">End</span>
            <input
              type="time"
              name="end"
              required
              defaultValue="12:00"
              className="mt-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700"
            />
          </label>
          <label className="min-w-0 flex-1 text-sm">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Room (optional)</span>
            <input
              name="location"
              placeholder="e.g. Audimax I"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700"
            />
          </label>
        </div>
        {courses.length > 0 && (
          <label className="block text-sm">
            <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">
              Link to course (optional)
            </span>
            <select
              name="courseId"
              defaultValue=""
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700"
            >
              <option value="">—</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="submit"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Add class
        </button>
      </form>

      {/* Weekly view */}
      {lectures.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          No classes yet. Add your lectures above to see your week.
        </p>
      ) : (
        <div className="space-y-4">
          {DAYS.filter((d) => byDay.has(d.v)).map((d) => (
            <section key={d.v}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {d.label}
              </h2>
              <ul className="space-y-2">
                {byDay.get(d.v)!.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                  >
                    <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300">
                      {fmtTime(l.startMin)}–{fmtTime(l.endMin)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.title}</span>
                      {l.location && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">📍 {l.location}</span>
                      )}
                    </span>
                    <form action={deleteLecture} className="shrink-0">
                      <input type="hidden" name="lectureId" value={l.id} />
                      <button
                        type="submit"
                        aria-label="Delete class"
                        className="rounded-full px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                      >
                        ✕
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Link
        href="/today"
        className="mt-6 inline-block text-sm text-gray-500 hover:underline dark:text-gray-400"
      >
        ← Back to Today
      </Link>
    </main>
  );
}
