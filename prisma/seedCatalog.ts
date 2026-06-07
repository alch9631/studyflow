/**
 * Seed the shared module catalog from official university module handbooks.
 * TUHH (studienplaene.tuhh.de):
 *   - IIW Informatik-Ingenieurwesen, B.Sc. — 41 modules (full handbook text)
 *   - CS  Computer Science, B.Sc.          — 20 core modules (126 LP)
 *
 * Run: DATABASE_URL="file:./dev.db" npx tsx prisma/seedCatalog.ts  (npm run db:seed:catalog)
 * Idempotent — upserts by (university, program, code).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";

type RawModule = {
  code: string;
  name: string;
  section: string;
  ects: number;
  content: string;
  examDate?: string | null; // ISO date, or null if no written exam this semester
  examSemester?: string | null;
};

const UNIVERSITY = "TUHH";

// Program code -> handbook data file. Add a line here to seed another program.
const SOURCES: { program: string; file: string }[] = [
  { program: "IIW", file: "iiw-modules.json" },
  { program: "CS", file: "csbs-modules.json" },
];

async function seedProgram(program: string, file: string): Promise<number> {
  const path = join(process.cwd(), "prisma", "data", file);
  const modules = JSON.parse(readFileSync(path, "utf-8")) as RawModule[];

  let count = 0;
  for (const m of modules) {
    const data = {
      name: m.name,
      section: m.section,
      ects: m.ects,
      content: m.content,
      examDate: m.examDate ? new Date(m.examDate + "T00:00:00Z") : null,
      examSemester: m.examSemester ?? null,
    };
    await prisma.moduleTemplate.upsert({
      where: { university_program_code: { university: UNIVERSITY, program, code: m.code } },
      update: data,
      create: { university: UNIVERSITY, program, code: m.code, ...data },
    });
    count++;
  }
  return count;
}

async function main() {
  for (const { program, file } of SOURCES) {
    const n = await seedProgram(program, file);
    console.log(`✅ Seeded ${n} ${UNIVERSITY} ${program} modules into the catalog.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
