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
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/"
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Choose a different Studiengang
        </Link>
        <Link
          href="/courses"
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Skip →
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-bold">{program.name} 🎓</h1>

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
        <div className="mt-6 rounded-xl border border-gray-200 p-5 text-sm text-gray-600">
          <p className="font-medium">You&apos;ve added every module in this program. 🎉</p>
          <Link href="/courses" className="mt-3 inline-block rounded-full bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Go to my courses →
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-6 text-sm text-gray-500">
            {modules.length} modules from the official handbook. Tick the ones
            you&apos;re taking and StudyFlow builds a plan for each. (Set the real
            exam date per course afterwards — see ⚙️ Course settings.)
          </p>

          <form action={addFromCatalog} className="space-y-6">
            {[...bySection.entries()].map(([section, mods]) => (
              <section key={section}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                  {section.replace(/^Fachmodule der /, "")}
                </h2>
                <ul className="space-y-1.5">
                  {mods.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 p-2.5 hover:border-gray-400">
                        <input type="checkbox" name="moduleId" value={m.id} className="mt-1" />
                        <span className="flex-1">
                          <span className="font-medium">{m.name}</span>
                          <span className="ml-2 text-xs text-gray-400">
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
              </section>
            ))}

            <div className="sticky bottom-4">
              <button
                type="submit"
                className="w-full rounded-full bg-brand px-5 py-3 font-medium text-white shadow-lg hover:bg-brand-dark"
              >
                Add selected modules to my courses →
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
