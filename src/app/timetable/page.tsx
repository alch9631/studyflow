import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { deleteLecture } from "./actions";
import EmptyState from "@/components/EmptyState";
import ToastForm from "@/components/ToastForm";
import SubmitButton from "@/components/SubmitButton";
import AddLectureForm from "./AddLectureForm";

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
      select: { id: true, title: true, location: true, weekday: true, startMin: true, endMin: true },
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
      <h1 className="mb-1 text-2xl font-bold tracking-tight">📅 My timetable</h1>
      <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
        Your recurring weekly classes — lectures, tutorials, labs.
      </p>

      {/* Add a class slot */}
      <AddLectureForm courses={courses} />

      {/* Weekly view */}
      {lectures.length === 0 ? (
        <EmptyState
          emoji="📅"
          title="No classes yet"
          description="Add your recurring lectures, tutorials, and labs above — they'll show up here as your weekly schedule and on Today."
        />
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
                    <ToastForm
                      action={deleteLecture}
                      successMessage="Class removed from your timetable."
                      errorMessage="Couldn't remove that class — please try again."
                      className="shrink-0"
                    >
                      <input type="hidden" name="lectureId" value={l.id} />
                      <SubmitButton
                        aria-label="Delete class"
                        className="rounded-full px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-gray-800"
                      >
                        ✕
                      </SubmitButton>
                    </ToastForm>
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
