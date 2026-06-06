import Link from "next/link";
import { importSyllabus } from "../actions";
import { isSyllabusAIEnabled } from "@/lib/syllabus";

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

export default function ImportPage() {
  const enabled = isSyllabusAIEnabled();

  return (
    <main className="mx-auto max-w-xl p-8">
      <Link href="/courses" className="text-sm text-gray-500 hover:underline">
        ← Back to courses
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Import from material ✨</h1>
      <p className="mb-6 text-sm text-gray-500">
        Paste a syllabus <em>or</em> upload a lecture script / study material
        (PDF, txt, md) — AI pulls out the topics and exam date, then builds a
        realistic plan.
      </p>

      {!enabled && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          ⚠️ AI import is off — set <code>OPENAI_API_KEY</code> in your{" "}
          <code>.env</code> to enable it. You can still add courses manually.
        </div>
      )}

      <form action={importSyllabus} className="space-y-5">
        <div>
          <label className="block text-sm font-medium">
            Upload material <span className="text-gray-400">(PDF, txt, md)</span>
          </label>
          <input
            type="file"
            name="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            disabled={!enabled}
            className="mt-1 block w-full text-sm disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">
            …or paste syllabus text
          </label>
          <textarea
            name="syllabus"
            rows={8}
            disabled={!enabled}
            placeholder="Paste the whole syllabus here — weeks, chapters, exam dates, anything."
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs disabled:bg-gray-100"
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

        <div>
          <label className="block text-sm font-medium">Minutes per study day</label>
          <input
            type="number"
            name="minutesPerDay"
            defaultValue={120}
            min={15}
            step={15}
            className="mt-1 w-32 rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={!enabled}
          className="rounded-full bg-black px-5 py-2.5 font-medium text-white hover:bg-gray-800 disabled:opacity-40"
        >
          ✨ Extract & build my plan
        </button>
      </form>
    </main>
  );
}
