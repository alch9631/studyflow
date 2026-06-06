/**
 * Seed the shared module catalog from official university module handbooks.
 * Currently: TUHH Informatik-Ingenieurwesen (IIW), B.Sc. — 41 modules parsed
 * from the public Modulhandbuch (studienplaene.tuhh.de).
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
const PROGRAM = "IIW";

async function main() {
  const file = join(process.cwd(), "prisma", "data", "iiw-modules.json");
  const modules = JSON.parse(readFileSync(file, "utf-8")) as RawModule[];

  let count = 0;
  for (const m of modules) {
    await prisma.moduleTemplate.upsert({
      where: {
        university_program_code: {
          university: UNIVERSITY,
          program: PROGRAM,
          code: m.code,
        },
      },
      update: {
        name: m.name,
        section: m.section,
        ects: m.ects,
        content: m.content,
        examDate: m.examDate ? new Date(m.examDate + "T00:00:00Z") : null,
        examSemester: m.examSemester ?? null,
      },
      create: {
        university: UNIVERSITY,
        program: PROGRAM,
        code: m.code,
        name: m.name,
        section: m.section,
        ects: m.ects,
        content: m.content,
        examDate: m.examDate ? new Date(m.examDate + "T00:00:00Z") : null,
        examSemester: m.examSemester ?? null,
      },
    });
    count++;
  }
  console.log(`✅ Seeded ${count} ${UNIVERSITY} ${PROGRAM} modules into the catalog.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
