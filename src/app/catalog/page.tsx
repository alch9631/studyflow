import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { addFromCatalog } from "../courses/actions";
import { programByCode, PROGRAMS } from "@/lib/programs";
import SubmitButton from "@/components/SubmitButton";
import { Button } from "@/components/ui/button";
import { getT } from "@/components/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Modules",
  description: "Browse your program's module catalog and add courses to your study plan in one tap.",
};

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const { program: programParam } = await searchParams;
  const program = programByCode(programParam ?? "IIW") ?? PROGRAMS[0];
  const t = await getT();

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
    // Only the fields the list/detail toggle renders — skip examSemester etc.
    select: {
      id: true,
      code: true,
      name: true,
      section: true,
      ects: true,
      content: true,
      examDate: true,
    },
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
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("catalog.modulesLabel")} · {program.code}
        </p>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{program.name}</h1>
        {/* Pick official modules below, or take a manual / import route. */}
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/courses/new"
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {t("catalog.addManually")}
          </Link>
          <Link
            href="/courses/import"
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {t("catalog.importSyllabus")}
          </Link>
        </div>
      </div>

      {allModules.length === 0 ? (
        <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <p className="font-medium">
            {t("catalog.notImportedTitle", { name: program.name, code: program.code })}
          </p>
          <p className="mt-2">
            {t("catalog.notImportedBody")}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/courses/new">{t("catalog.addCourse")}</Link>
            </Button>
            <Link href="/courses/import" className="rounded-full border border-amber-400 px-4 py-2 font-medium transition-colors hover:bg-amber-100 active:scale-[.97] dark:border-amber-700 dark:hover:bg-amber-900/40">
              {t("catalog.importSyllabusLong")}
            </Link>
          </div>
        </div>
      ) : modules.length === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-800 p-5 text-sm text-gray-600 dark:text-gray-300">
          <p className="font-medium">{t("catalog.allAddedTitle")}</p>
          <Button asChild className="mt-3">
            <Link href="/courses">{t("catalog.goToCourses")}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <strong className="font-semibold text-gray-800 dark:text-gray-100">
              {t.n("catalog.moduleCount", modules.length)}
            </strong>{" "}
            {t("catalog.introTail")}
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              {t("catalog.examDateHint")}
            </span>
          </div>

          <form action={addFromCatalog} className="space-y-3 pb-8">
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
                  {mods.map((m) => {
                    const snippet = (m.content ?? "")
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 240);
                    return (
                      <li key={m.id}>
                        <div className="relative rounded-lg border border-gray-200 p-3 pr-10 transition-colors hover:border-gray-400 dark:border-gray-800 dark:hover:border-gray-600">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              name="moduleId"
                              value={m.id}
                              className="mt-0.5 h-4 w-4 shrink-0"
                            />
                            <span className="min-w-0 flex-1 font-medium leading-snug">{m.name}</span>
                          </label>
                          {/* Module details: a "?" info toggle in the top-right corner */}
                          <details className="absolute right-2 top-2">
                            <summary
                              aria-label={t("catalog.detailsFor", { name: m.name })}
                              title={t("catalog.details")}
                              className="inline-flex cursor-pointer list-none items-center text-gray-400 transition-colors hover:text-brand"
                            >
                              <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px] font-bold">
                                ?
                              </span>
                            </summary>
                            <div className="absolute right-0 top-7 z-10 w-64 max-w-[75vw] rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-600 shadow-lg dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
                              <div className="font-medium text-gray-700 dark:text-gray-200">
                                {m.code} · {m.ects} LP
                                {m.examDate ? ` · ${t("catalog.examShort", { date: m.examDate.toISOString().slice(0, 10) })}` : ""}
                              </div>
                              {snippet && (
                                <p className="mt-1.5 leading-relaxed">{snippet}…</p>
                              )}
                            </div>
                          </details>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}

            {/* Primary action flows with the content at the end of the list. */}
            <div className="mt-4">
              <SubmitButton
                variant="primary"
                size="lg"
                className="w-full"
                pendingLabel={t("catalog.adding")}
              >
                {t("catalog.addSelected")}
              </SubmitButton>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
