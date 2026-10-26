import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { storeMaterial, readMaterial } from "./materials";
import { recognizeMaterialOutline, extractMaterialOutline, acceptMaterialOutline } from "./materialOutline";
import { readMaterialOutline } from "./documentOutline";
import { MATERIAL_RECOGNITION_VERSION, readMaterialRecognition, recognitionNeedsRefresh } from "./materialRecognition";

let checks = 0;
function check(name: string, value: unknown) { assert.ok(value, name); checks++; console.log(`  ✓ ${name}`); }
const script = "# 1 Foundations\n## 1.1 Numbers\nNumbers and precision.\n\n# 2 Interpolation\n## 2.1 Polynomials\nPolynomial interpolation.\n\n# 3 Quadrature\n## 3.1 Integration\nQuadrature rules.\n";

async function main() {
  // Automatic recognition is entirely local; configured provider keys must not
  // cause an unrequested AI call when a course opens.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Automatic recognition must not call a provider"); };
  const user = await prisma.user.create({ data: { email: `recognition-${Date.now()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `recognition-other-${Date.now()}@example.test` } });
  try {
    const course = await prisma.course.create({ data: { userId: user.id, name: "Automatic recognition", examDate: new Date(Date.now() + 86400000 * 30), studyDays: "0,1,2,3,4,5,6" } });
    const upload = (await storeMaterial(user.id, course.id, new File([script], "lecture.md"), "skript"))!;
    let file = await prisma.moduleFile.findUniqueOrThrow({ where: { id: upload.id } });
    let outline = readMaterialOutline(file.analysis)!;
    check("upload itself recognizes all chapters without a Prepare action", outline.entries.filter((entry) => !entry.parentId).length === 3);
    check("upload persists versioned recognition and extracted character count", readMaterialRecognition(file.analysis)?.status === "ready" && file.extractedChars === script.length);
    check("automatic recognition does not alter the student's plan", await prisma.topic.count({ where: { courseId: course.id } }) === 0);
    let calls = 0;
    const countExtraction: typeof extractMaterialOutline = async (data) => { calls++; return extractMaterialOutline(data); };
    await recognizeMaterialOutline(user.id, file.id, false, countExtraction);
    check("reviewing an already recognized upload does not parse it again", calls === 0);

    await acceptMaterialOutline(user.id, file.id, outline.id, outline.units.map((unit) => unit.id));
    const topicsBefore = await prisma.topic.findMany({ where: { courseId: course.id }, orderBy: { id: "asc" } });
    const metadata = JSON.parse(file.analysis!);
    file = await prisma.moduleFile.findUniqueOrThrow({ where: { id: file.id } });
    metadata.outline = readMaterialOutline(file.analysis);
    metadata.recognition.version = MATERIAL_RECOGNITION_VERSION - 1;
    await prisma.moduleFile.update({ where: { id: file.id }, data: { analysis: JSON.stringify(metadata) } });
    const refreshed = (await recognizeMaterialOutline(user.id, file.id, false, countExtraction))!;
    check("outdated recognition is automatically reprocessed", calls === 1 && refreshed.recognition.version === MATERIAL_RECOGNITION_VERSION);
    check("refresh preserves accepted topic mappings and preview IDs", refreshed.outline?.id === outline.id && refreshed.outline.units.every((unit) => !!unit.topicId));
    check("refresh preserves every existing topic and progress field", JSON.stringify(await prisma.topic.findMany({ where: { courseId: course.id }, orderBy: { id: "asc" } })) === JSON.stringify(topicsBefore));

    const legacyDrafts = JSON.stringify({ version: 1, id: "old-six-page-batch", method: "excerpts", items: [] });
    const legacy = await prisma.moduleFile.create({ data: { courseId: course.id, filename: "old.md", mimeType: "text/plain", content: Buffer.from(script), category: "skript", analysis: JSON.stringify({ summary: "Keep this summary" }), studyDrafts: legacyDrafts } });
    const [first, second] = await Promise.all([recognizeMaterialOutline(user.id, legacy.id, false, countExtraction), recognizeMaterialOutline(user.id, legacy.id, false, countExtraction)]);
    check("concurrent automatic requests share a single extraction", calls === 2 && first?.outline?.id === second?.outline?.id);
    const legacyAfter = await prisma.moduleFile.findUniqueOrThrow({ where: { id: legacy.id } });
    check("old excerpt batches cannot prevent whole-document recognition", first?.outline?.units.length === 3);
    check("automatic backfill keeps old task drafts and other metadata", legacyAfter.studyDrafts === legacyDrafts && JSON.parse(legacyAfter.analysis!).summary === "Keep this summary");
    const previousCalls = calls;
    check("foreign users cannot trigger extraction or read recognition", await recognizeMaterialOutline(other.id, legacy.id, false, countExtraction) === null && calls === previousCalls);

    const plain = (await storeMaterial(user.id, course.id, new File(["A plain paragraph with no headings."], "notes.txt"), "skript"))!;
    const negative = await recognizeMaterialOutline(user.id, plain.id, false, countExtraction);
    check("no-outline results are recorded and cached", negative?.recognition.status === "no-outline" && calls === previousCalls);
    const scanned = await recognizeMaterialOutline(user.id, plain.id, true, async () => ({ outline: null, extractedChars: 0 }));
    check("unreadable text is distinguished from a missing outline", scanned?.recognition.status === "unreadable");

    const broken = (await storeMaterial(user.id, course.id, new File(["Not a ZIP document"], "broken.docx"), "skript"))!;
    const brokenFile = await prisma.moduleFile.findUniqueOrThrow({ where: { id: broken.id } });
    check("recognition errors do not fail a committed upload", readMaterialRecognition(brokenFile.analysis)?.status === "failed");
    check("the original remains accessible after a recognition error", Buffer.from((await readMaterial(user.id, broken.id))!.content!).toString() === "Not a ZIP document");
    check("failed recognition has a bounded automatic retry time", !recognitionNeedsRefresh(brokenFile.analysis) && recognitionNeedsRefresh(brokenFile.analysis, Date.now() + 120_000));
    const retried = await recognizeMaterialOutline(user.id, broken.id, true, async () => ({ outline: null, extractedChars: 0 }));
    check("manual retry can recover recognition without another upload", retried?.recognition.status === "unreadable");

    outline = readMaterialOutline((await prisma.moduleFile.findUniqueOrThrow({ where: { id: upload.id } })).analysis)!;
    const failedRefresh = await recognizeMaterialOutline(user.id, upload.id, true, async () => { throw new Error("temporary extractor failure"); });
    check("a failed refresh preserves the prior outline and source mappings", failedRefresh?.outline?.id === outline.id && failedRefresh.outline.units.every((unit) => !!unit.topicId));
    const exercise = (await storeMaterial(user.id, course.id, new File([script], "exercises.md"), "uebung"))!;
    check("exercise uploads retain their task-oriented preparation", readMaterialRecognition((await prisma.moduleFile.findUniqueOrThrow({ where: { id: exercise.id } })).analysis)?.status === "skipped");
    check("malformed recognition metadata refreshes safely", readMaterialRecognition("{bad") === null && recognitionNeedsRefresh("{bad"));
    check("a ready marker cannot hide a missing outline", recognitionNeedsRefresh(JSON.stringify({ recognition: { version: MATERIAL_RECOGNITION_VERSION, status: "ready", checkedAt: new Date().toISOString() } })));
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.$disconnect();
  }
  console.log(`\n${checks} automatic recognition checks passed.`);
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
