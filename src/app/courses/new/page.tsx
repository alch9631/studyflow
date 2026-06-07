import Link from "next/link";
import { createCourse } from "../actions";

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

export default function NewCoursePage() {
  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <Link href="/courses" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← Back to courses
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">New course</h1>

      <form action={createCourse} className="space-y-5">
        <div>
          <label className="block text-sm font-medium">Course name</label>
          <input
            name="name"
            required
            placeholder="e.g. Algorithms"
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Exam date</label>
          <input
            type="date"
            name="examDate"
            required
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            Topics / chapters (one per line)
          </label>
          <textarea
            name="topics"
            rows={6}
            placeholder={"Sorting\nGraphs\nDynamic programming"}
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 font-mono text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Study days</label>
          <div className="mt-2 flex flex-wrap gap-3">
            {DAYS.map((d) => (
              <label key={d.v} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="studyDays"
                  value={d.v}
                  defaultChecked={d.v >= 1 && d.v <= 5}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500">
          StudyFlow works out how much to study each day to finish before your
          exam — you don&apos;t set the hours.
        </p>

        <button
          type="submit"
          className="rounded-full bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-dark"
        >
          Create & build my plan
        </button>
      </form>
    </main>
  );
}
