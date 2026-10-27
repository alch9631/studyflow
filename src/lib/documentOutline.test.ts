import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { detectDocumentOutline, outlineUnits, structureAwareInput, readMaterialOutline, documentPages } from "./documentOutline";
import { prepareMaterialOutline, acceptMaterialOutline } from "./materialOutline";
import { storeMaterial } from "./materials";
import { quickStudySources } from "./practicalStudy";
import { analyzeModuleContent, extractSyllabus } from "./syllabus";
import { quickStudyTask } from "./studyTask";

let checks = 0;
function check(name: string, value: unknown) { assert.ok(value, name); checks++; console.log(`  ✓ ${name}`); }

// A compact regression based on the reported script: chapter 9 must survive
// even when its body is far beyond a model request or the first six PDF pages.
const titles = ["Introduction", "Finite precision arithmetic", "Linear systems of equations", "Interpolation", "Nonlinear equations", "Least squares problems", "Eigenvalue problems", "Differentiation", "Quadrature"];
const pages = [
  { num: 1, text: "Numerical Mathematics 1" },
  { num: 2, text: "Contents\n" + titles.slice(0, 5).map((title, i) => `${i + 1} ${title} ${i + 5}\n${i + 1}.1 Section ${i + 1} . . . . ${i + 5}`).join("\n") },
  { num: 3, text: "CONTENTS\n" + titles.slice(5).map((title, i) => `${i + 6} ${title} ${i + 10}\n${i + 6}.1 Section ${i + 6} . . . . ${i + 10}`).join("\n") },
  ...titles.map((title, i) => ({ num: i + 4, text: `Chapter ${i + 1}\n${title}\n${i + 1}.1 Section ${i + 1}\n${"Body material. ".repeat(2500)}` })),
];

async function main() {
  process.env.OPENAI_API_KEY = ""; process.env.ANTHROPIC_API_KEY = "";
  const outline = detectDocumentOutline(pages)!;
  check("all nine chapters are detected across multiple contents pages", outline.entries.filter((e) => !e.parentId).map((e) => e.title).join("|") === titles.join("|"));
  check("sections retain chapter hierarchy", outline.entries.find((e) => e.id === "9.1")?.parentId === "9");
  check("printed page offsets resolve to actual physical PDF pages", outline.entries.find((e) => e.id === "9")?.page === 12);
  check("contents headings and repeated body headings are deduplicated", outline.entries.length === 18);
  const partialContents = detectDocumentOutline([{num:1,text:"Contents\n1 Introduction 2\n2 Interpolation 3"},{num:2,text:"Chapter 1\nIntroduction"},{num:3,text:"Chapter 2\nInterpolation"},{num:4,text:"Chapter 3\nQuadrature"}])!;
  check("later body chapters survive a partial contents list", partialContents.entries.at(-1)?.title === "Quadrature");
  const units = outlineUnits(outline, pages.length, 0);
  check("parents and their whole sections are not both scheduled", units.length === 9 && !units.some((u) => u.id === "9"));
  check("later plan units have source page ranges", units.at(-1)?.reference === "PDF p. 12");
  const fake = detectDocumentOutline([...pages, { num: 13, text: "0 · · · 0 −ℓn,i 0 · · · 0 1\n1 Matrix . . . 1\n2 Matrix . . . 2\n3 Matrix . . . 3" }])!;
  check("formula dot patterns after the contents do not become chapters", fake.entries.length === outline.entries.length);
  const headings = detectDocumentOutline([{ num: 1, text: "Kapitel 1\nGrundlagen\n1.1 Zahlen\n\nKapitel 2\nInterpolation\n2.1 Polynome" }], false)!;
  check("German named chapters work without a contents page", headings.method === "headings" && headings.entries.find((e) => e.id === "2")?.title === "Interpolation");
  check("number-only chapter labels take their titles from the next line", headings.entries.every((e) => !/^Kapitel \d+$/.test(e.title)));
  const bare = detectDocumentOutline([{ num: 1, text: "1 Introduction\nBody\n\n2 Interpolation\nBody\n\n3 Quadrature\nBody" }], false)!;
  check("coherent numbered headings work without Chapter labels", bare.entries.length === 3 && bare.entries.at(-1)?.title === "Quadrature");
  check("an ordinary paragraph or a lone numbered line is not a course outline", detectDocumentOutline([{ num: 1, text: "A paragraph.\n1 An isolated item" }]) === null);
  const singleChapter = detectDocumentOutline([{num:1,text:"Chapter 2: Finite precision arithmetic\nMachine numbers"},{num:2,text:"Chapter 2: Finite precision arithmetic\nRounding"}])!;
  check("a single-chapter slide deck keeps its chapter title without duplicates", singleChapter.entries.length === 1 && singleChapter.entries[0].title === "Finite precision arithmetic");
  const text = pages.map((p) => `${p.text}\n\n-- ${p.num} of ${pages.length} --\n\n`).join("");
  check("pdf-parse text delimiters preserve physical page numbers", documentPages(text).length === pages.length && documentPages(text).at(-1)?.num === 12);
  const capped = structureAwareInput(text, 1800);
  check("bounded model input retains late chapters", capped.length <= 1800 && capped.includes("9 Quadrature"));
  check("a shorter retry still retains late chapters", structureAwareInput(text, 900).includes("9 Quadrature"));
  const wrapped = detectDocumentOutline([{ num: 1, text: "Contents\n1 Introduction 2\n2 Very long heading title 3" }, { num: 2, text: "Chapter 1\nIntroduction" }, { num: 3, text: "Chapter 2\nVery long heading\ntitle" }])!;
  check("contents supply the full title even when the body wraps it", wrapped.entries.at(-1)?.title === "Very long heading title");
  const intro = detectDocumentOutline([{ num: 1, text: "Chapter 1\nFoundations" }, { num: 2, text: "1.1 Numbers" }, { num: 3, text: "Chapter 2\nInterpolation\n2.1 Polynomials" }])!;
  const introUnits = outlineUnits(intro, 3, 0);
  check("introductory chapter pages remain covered without counting the entire chapter twice", introUnits[0].id === "1" && introUnits[0].endPage === 1 && introUnits[1].page === 2);
  check("corrupt cached outlines are rejected", readMaterialOutline('{"outline":{"version":1}}') === null);

  const savedFetch = globalThis.fetch;
  const originalURL = process.env.OPENAI_BASE_URL;
  const originalCap = process.env.AI_MAX_INPUT_CHARS;
  try {
    process.env.OPENAI_API_KEY = "fixture"; process.env.OPENAI_BASE_URL = "https://fixture.invalid/v1"; process.env.AI_MAX_INPUT_CHARS = "1800";
    const requests: string[] = [];
    globalThis.fetch = async (input, init) => {
      const body = await new Request(input, init).json(); requests.push(body.messages[1].content);
      if (requests.length === 1) return Response.json({ error: { message: "Limit 12000, Requested 18000", type: "tokens", code: "request_too_large" } }, { status: 413 });
      return Response.json({ choices: [{ message: { content: JSON.stringify({ courseName: "Numerical Mathematics", examDate: "", summary: "Script", concepts: [], prerequisites: [], category: "skript", topics: [{ title: "Chapter 1 only", effort: 1, difficulty: 1, estMinutes: 60 }], examQuestions: [] }) } }] });
    };
    const analysis = await analyzeModuleContent("Numerical Mathematics", text, "skript");
    check("model omission cannot remove the script's later chapter topics", analysis.topics.length === 9 && analysis.topics.at(-1)?.title === "9.1 Section 9");
    check("over-budget retries retain the whole-document structure", requests.length === 2 && requests.every((request) => request.includes("9 Quadrature")));
    check("syllabus import uses the same complete structure", (await extractSyllabus(text)).topics.at(-1)?.title === "9.1 Section 9");
  } finally {
    globalThis.fetch = savedFetch; process.env.OPENAI_API_KEY = "";
    if (originalURL === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = originalURL;
    if (originalCap === undefined) delete process.env.AI_MAX_INPUT_CHARS; else process.env.AI_MAX_INPUT_CHARS = originalCap;
  }

  const user = await prisma.user.create({ data: { email: `outline-${Date.now()}@example.test` } });
  const other = await prisma.user.create({ data: { email: `outline-other-${Date.now()}@example.test` } });
  try {
    const course = await prisma.course.create({ data: { userId: user.id, name: "Numerical maths", examDate: new Date(Date.now() + 86400000 * 30), studyDays: "0,1,2,3,4,5,6" } });
    const markdown = titles.map((title, i) => `# ${i + 1} ${title}\n## ${i + 1}.1 Section ${i + 1}\nThe source for section ${i + 1}.\n`).join("\n");
    const file = (await storeMaterial(user.id, course.id, new File([markdown], "script.md"), "skript"))!;
    check("foreign users cannot prepare an outline", await prepareMaterialOutline(other.id, file.id) === null);
    const prepared = (await prepareMaterialOutline(user.id, file.id))!;
    check("outline preparation does not silently create topics", prepared.units.length === 9 && await prisma.topic.count({ where: { courseId: course.id } }) === 0);
    check("whole-document structure is cached separately from excerpt drafts", (await prepareMaterialOutline(user.id, file.id))?.id === prepared.id);
    const plain = await prisma.topic.create({ data: { courseId: course.id, title: "Old generic outline" } });
    const completed = await prisma.topic.create({ data: { courseId: course.id, title: "Finished work", done: true } });
    const noted = await prisma.topic.create({ data: { courseId: course.id, title: "My notes", note: { create: { body: "Keep this explanation" } } } });
    const journal = await prisma.topic.create({ data: { courseId: course.id, title: "Session notes", focusNotes: { create: { body: "Keep the journal" } } } });
    const rated = await prisma.topic.create({ data: { courseId: course.id, title: "Rated work", confidence: "struggling" } });
    const oldTask = await prisma.topic.create({ data: { courseId: course.id, title: "Chapter 1", studyTask: JSON.stringify(quickStudyTask("read", 15, "en", { sourceFileId: file.id, sourceRef: "Lines 2–3" })) } });
    const ids = prepared.units.map((unit) => unit.id);
    check("foreign users cannot apply the plan", await acceptMaterialOutline(other.id, file.id, prepared.id, ids, true) === null);
    check("stale previews cannot change the plan", await acceptMaterialOutline(user.id, file.id, "stale", ids, true) === null);
    await assert.rejects(() => acceptMaterialOutline(user.id, file.id, prepared.id, ["invented"], true)); checks++;
    await acceptMaterialOutline(user.id, file.id, prepared.id, ids, true);
    check("replacement removes only unused generic topics", await prisma.topic.count({ where: { id: plain.id } }) === 0);
    check("completed work, notes and confidence are preserved", await prisma.topic.count({ where: { id: { in: [completed.id, noted.id, rated.id] } } }) === 3);
    check("replacement preserves topics with session note entries", await prisma.topic.count({ where: { id: journal.id } }) === 1 && await prisma.focusNote.count({ where: { topicId: journal.id } }) === 1);
    const created = await prisma.topic.findMany({ where: { courseId: course.id }, orderBy: { order: "asc" } });
    check("existing excerpt tasks are grouped under their actual source section", created.find((topic) => topic.id === oldTask.id)?.parentTopicId === created[0].id);
    check("accepted topics follow chapter order through the end of the script", created[0].title === "1.1 Section 1" && created[8].title === "9.1 Section 9");
    check("chapter coverage is broad work, not a falsely complete small task", created.slice(0, 9).every((topic) => topic.studyTask === null && !topic.done));
    await acceptMaterialOutline(user.id, file.id, prepared.id, ids, true);
    check("applying the same preview twice never duplicates topics", await prisma.topic.count({ where: { courseId: course.id } }) === created.length);
    const late = created.find((topic) => topic.title === "9.1 Section 9")!;
    const source = await quickStudySources(user.id, course.id, file.id, late.id);
    check("starting a later topic opens that section instead of the document beginning", source?.sections[0]?.text.includes("9.1 Section 9") && source.cursor > 1);
    const exercise = (await storeMaterial(user.id, course.id, new File([markdown], "exercises.md"), "uebung"))!;
    check("exercise sheets retain exercise task preparation", await prepareMaterialOutline(user.id, exercise.id) === null);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: [user.id, other.id] } } });
    await prisma.$disconnect();
  }
  console.log(`\n${checks} outline checks passed.`);
}
main().catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
