import Link from "next/link";
import { prisma } from "@/lib/db";
import { addFromCatalog } from "../courses/actions";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const modules = await prisma.moduleTemplate.findMany({
    where: { university: "TUHH", program: "IIW" },
    orderBy: [{ section: "asc" }, { name: "asc" }],
  });

  // Group by section for a tidy, scannable list.
  const bySection = new Map<string, typeof modules>();
  for (const m of modules) {
    if (!bySection.has(m.section)) bySection.set(m.section, []);
    bySection.get(m.section)!.push(m);
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <Link href="/courses" className="text-sm text-gray-500 hover:underline">
        ← Back to courses
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">TUHH module catalog 🎓</h1>
      <p className="mb-6 text-sm text-gray-500">
        Informatik-Ingenieurwesen (B.Sc.) — {modules.length} modules from the
        official handbook. Tick the ones you&apos;re taking and StudyFlow builds
        a plan for each. (Exam dates default to ~a semester out — adjust per
        course after.)
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
                    <input
                      type="checkbox"
                      name="moduleId"
                      value={m.id}
                      className="mt-1"
                    />
                    <span className="flex-1">
                      <span className="font-medium">{m.name}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        {m.code} · {m.ects} LP
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
            className="w-full rounded-full bg-black px-5 py-3 font-medium text-white shadow-lg hover:bg-gray-800"
          >
            Add selected modules to my courses →
          </button>
        </div>
      </form>
    </main>
  );
}
