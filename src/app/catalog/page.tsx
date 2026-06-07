import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { addFromCatalog } from "../courses/actions";
import { programByCode, PROGRAMS } from "@/lib/programs";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const { program: programParam } = await searchParams;
  const program = programByCode(programParam ?? "IIW") ?? PROGRAMS[0];

  // Hide modules the student has already added as courses (by source code).
  const userId = await getCurrentUserId();
  const taken = await prisma.course.findMany({
    where: { userId, sourceCode: { not: null } },
    select: { sourceCode: true },
  });
  const takenCodes = new Set(taken.map((c) => c.sourceCode));

  const allModules = await prisma.moduleTemplate.findMany({
    where: { university: "TUHH", program: program.code },
    orderBy: [{ section: "asc" }, { name: "asc" }],
  });
  const modules = allModules.filter((m) => !takenCodes.has(m.code));

  // Group by section for a tidy, scannable list.
  const bySection = new Map<string, typeof modules>();
  for (const m of modules) {
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section)!.push(m);
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          🎓 Modules · {program.code}
        </p>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{program.name}</h1>
      </div>

      {allModules.length === 0 ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-medium">
            The module catalog for {program.name} ({program.code}) isn&apos;t imported yet.
          </p>
          <p className="mt-2">
            You can still build your plan — add courses manually or paste a
            syllabus and let AI extract the topics.
          </p>
          <div className="mt-3 flex gap-3">
            <Link href="/courses/new" className="rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
              + Add a course
            </Link>
            <Link href="/courses/import" className="rounded-full border border-amber-400 px-4 py-2 font-medium hover:bg-amber-100">
              ✨ Import a syllabus
            </Link>
          </div>
        </div>
      ) : modules.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 p-5 text-sm text-gray-600 dark:text-gray-300">
          <p className="font-medium">You&apos;ve added every module in this program. 🎉</p>
          <Link href="/courses" className="mt-3 inline-block rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Go to my courses →
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <strong className="font-semibold text-gray-800 dark:text-gray-100">
              {modules.length} modules
            </strong>{" "}
            from the official handbook. Tick the ones you&apos;re taking and
            StudyFlow builds a plan for each.
            <span className="mt-1 block text-xs text-gray-400 dark:text-gray-500">
              You can set the real exam date per course afterwards in ⚙️ Course settings.
            </span>
          </div>

          <form action={addFromCatalog} className="space-y-3">
            {[...bySection.entries()].map(([section, mods]) => (
              <details
                key={section}
                open
                className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 bg-gray-50 px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                  <span className="truncate">{section.replace(/^Fachmodule der /, "")}</span>
                  <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    {mods.length}
                  </span>
                </summary>
                <ul className="space-y-1.5 p-2.5">
                  {mods.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600">
                        <input
                          type="checkbox"
                          name="moduleId"
                          value={m.id}
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium leading-snug">{m.name}</span>
                          <span className="mt-1 block text-xs text-gray-400 dark:text-gray-500">
                            {m.code} · {m.ects} LP
                            {m.examDate
                              ? ` · exam ${m.examDate.toISOString().slice(0, 10)}`
                              : ""}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            ))}

            {/* Single sticky primary action, sitting just above the bottom nav */}
            <div className="sticky bottom-20 z-10 mt-4 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur sm:bottom-4 dark:border-gray-800 dark:bg-gray-900/95">
              <button
                type="submit"
                className="w-full rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-white hover:bg-brand-dark"
              >
                Add selected →
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
