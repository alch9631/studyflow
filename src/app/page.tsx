import Link from "next/link";
import { PROGRAMS } from "@/lib/programs";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-8 px-5 py-10 text-center">
      {/* TUHH wordmark — swap for the official SVG if you have the rights. */}
      <div className="flex flex-col items-center gap-1">
        <div
          className="rounded-md px-4 py-2 text-2xl font-extrabold tracking-tight text-white"
          style={{ backgroundColor: "#00509b" }}
        >
          TUHH
        </div>
        <span className="text-xs uppercase tracking-widest text-gray-400 dark:text-gray-500">
          Technische Universität Hamburg
        </span>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          StudyFlow ⚡
        </h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          The study plan that builds itself — and heals itself when you fall behind.
        </p>
      </div>

      {/* Studiengang selection menu — all TUHH Bachelor programs */}
      <div className="w-full text-left">
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
          Choose your Studiengang
        </p>
        <div className="max-h-[48vh] divide-y divide-gray-100 overflow-y-auto rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
          {PROGRAMS.map((p) => (
            <Link
              key={p.code}
              href={`/catalog?program=${p.code}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{p.code}</span>
              </span>
              <span className="shrink-0 text-gray-300 dark:text-gray-600">›</span>
            </Link>
          ))}
        </div>
      </div>

      {/* My courses — card-style box (was a plain text link) */}
      <Link
        href="/courses"
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-left hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600"
      >
        <span>
          <span className="block font-semibold">📚 My courses</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Jump back into your study plan
          </span>
        </span>
        <span className="shrink-0 text-gray-400">→</span>
      </Link>
    </main>
  );
}
