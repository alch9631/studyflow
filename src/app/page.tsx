import Link from "next/link";
import { PROGRAMS } from "@/lib/programs";
import { buttonClasses } from "@/components/ui";

const FEATURES = [
  {
    icon: "🧭",
    title: "Builds itself",
    body: "Pick your modules — StudyFlow reads them and works backward from each exam to a realistic daily plan.",
  },
  {
    icon: "🩹",
    title: "Heals when you slip",
    body: "Fell behind? One tap re-plans the days you have left around what's still undone. No guilt, no spreadsheets.",
  },
  {
    icon: "🧠",
    title: "Made to stick",
    body: "Spaced reviews and self-test questions are baked in — the proven ways to actually remember it on exam day.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-12 px-5 py-12 sm:py-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-5 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="rounded-md px-4 py-2 text-2xl font-extrabold tracking-tight text-white shadow-sm"
            style={{ backgroundColor: "#00509b" }}
          >
            TUHH
          </div>
          <span className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500">
            Technische Universität Hamburg
          </span>
        </div>

        <div>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            StudyFlow <span className="text-brand">⚡</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-pretty text-base text-gray-500 dark:text-gray-400 sm:text-lg">
            The study plan that builds itself — and heals itself when you fall
            behind.
          </p>
        </div>
      </section>

      {/* Value props */}
      <section className="grid gap-3 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-gray-200 bg-white p-5 text-left transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
          >
            <div className="text-2xl">{f.icon}</div>
            <h2 className="mt-2 font-semibold">{f.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {f.body}
            </p>
          </div>
        ))}
      </section>

      {/* Primary action: choose your Studiengang */}
      <section className="w-full text-left">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Choose your Studiengang
          </h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {PROGRAMS.length} programs
          </span>
        </div>
        <div className="max-h-[44vh] divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {PROGRAMS.map((p) => (
            <Link
              key={p.code}
              href={`/catalog?program=${p.code}`}
              className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{p.code}</span>
              </span>
              <span className="shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 dark:text-gray-600">
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Secondary action: jump back into existing courses */}
      <section className="flex flex-col gap-3">
        <Link
          href="/courses"
          className="group flex w-full items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-left transition-colors hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-xl">
            📚
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">My Courses</span>
            <span className="block text-sm text-gray-500 dark:text-gray-400">
              Jump back into your study plan
            </span>
          </span>
          <span className="shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>

        <Link
          href="/courses/import"
          className={buttonClasses("secondary", "md", "w-full")}
        >
          ✨ Import a syllabus instead
        </Link>
      </section>
    </main>
  );
}
