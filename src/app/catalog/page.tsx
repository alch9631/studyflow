import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { addFromCatalog } from "../courses/actions";
import { programByCode, PROGRAMS } from "@/lib/programs";
import { Button } from "@/components/ui/button";
import { getT } from "@/components/i18n/server";
import CatalogBrowser, { type CatalogModule } from "./CatalogBrowser";

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

  // Detect "already added": compare each module's `code` against the source code
  // of the student's existing catalog-sourced courses (Course.sourceCode).
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

  // Shape for the client picker: pre-trim the handbook snippet, pre-serialize the
  // exam date, and flag the already-added modules — so the island never carries
  // the heavy `content` field or a Date across the RSC boundary.
  const modules: CatalogModule[] = allModules.map((m) => ({
    id: m.id,
    code: m.code,
    name: m.name,
    section: m.section,
    ects: m.ects,
    examDate: m.examDate ? m.examDate.toISOString().slice(0, 10) : null,
    snippet: (m.content ?? "").replace(/\s+/g, " ").trim().slice(0, 240),
    added: takenCodes.has(m.code),
  }));
  const addableCount = modules.filter((m) => !m.added).length;

  // Other programs we have a handbook for — let the student switch the catalog.
  const seededPrograms = PROGRAMS.filter((p) => p.seeded);

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("catalog.modulesLabel")} · {program.code}
        </p>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{program.name}</h1>

        {/* Switch program (server-driven — modules are fetched per program). */}
        {seededPrograms.length > 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {seededPrograms.map((p) => (
              <Link
                key={p.code}
                href={`/catalog?program=${p.code}`}
                aria-current={p.code === program.code ? "page" : undefined}
                className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  p.code === program.code
                    ? "bg-brand text-brand-foreground"
                    : "border border-gray-200 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                }`}
              >
                {p.code}
              </Link>
            ))}
          </div>
        )}

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
          <p className="mt-2">{t("catalog.notImportedBody")}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/courses/new">{t("catalog.addCourse")}</Link>
            </Button>
            <Link
              href="/courses/import"
              className="rounded-full border border-amber-400 px-4 py-2 font-medium transition-colors hover:bg-amber-100 active:scale-[.97] dark:border-amber-700 dark:hover:bg-amber-900/40"
            >
              {t("catalog.importSyllabusLong")}
            </Link>
          </div>
        </div>
      ) : addableCount === 0 ? (
        <div className="mt-6 rounded-xl border border-gray-200 p-5 text-sm text-gray-600 dark:border-gray-800 dark:text-gray-300">
          <p className="font-medium">{t("catalog.allAddedTitle")}</p>
          <Button asChild className="mt-3">
            <Link href="/courses">{t("catalog.goToCourses")}</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
            <strong className="font-semibold text-gray-800 dark:text-gray-100">
              {t.n("catalog.moduleCount", addableCount)}
            </strong>{" "}
            {t("catalog.introTail")}
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              {t("catalog.examDateHint")}
            </span>
          </div>

          <CatalogBrowser modules={modules} action={addFromCatalog} />
        </>
      )}
    </main>
  );
}
