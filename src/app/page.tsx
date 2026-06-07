import Link from "next/link";
import { PROGRAMS } from "@/lib/programs";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-8 p-8 text-center">
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

      <div className="w-full">
        <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">
          Choose your Studiengang
        </p>
        <div className="grid gap-2">
          {PROGRAMS.map((p) => (
            <Link
              key={p.code}
              href={`/catalog?program=${p.code}`}
              className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-gray-800 px-4 py-3 text-left hover:border-gray-400 dark:hover:border-gray-600"
            >
              <span>
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{p.code}</span>
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {p.seeded ? "modules ready →" : "manual →"}
              </span>
            </Link>
          ))}
        </div>
      </div>

      <Link href="/courses" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        or go to my courses →
      </Link>
    </main>
  );
}
