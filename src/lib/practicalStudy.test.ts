import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { storeMaterial } from "./materials";
import { textStudySections, groundedStudyDrafts, readStudyDrafts } from "./studyDraft";
import { quickStudyTask, readStudyProgress, readStudyTask, taskSourceHref } from "./studyTask";
import { prepareStudyDrafts, acceptStudyDrafts, startQuickStudy, saveStudyCheckpoint } from "./practicalStudy";
import { rebuildSchedule, todayISO } from "./planService";
import { recordStudyResult } from "./studyTaskService";
import { materialStudyBatch } from "./materialSections";
import { suggestStudyTasks } from "./syllabus";

let checks = 0;
function check(name: string, condition: unknown) { assert.ok(condition, name); checks++; console.log(`  ✓ ${name}`); }
const material = "Exercise 1: Threads\nName a resource shared by threads.\nSolution: Threads share heap objects.\nExercise 2: Isolation\nExplain process isolation.\nSolution: Processes have separate address spaces.";

/** Small valid PDF fixture with identifiable text on eight real pages. */
function sourcePDF() {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Count 8 /Kids [${Array.from({length:8},(_,i)=>`${4+i*2} 0 R`).join(" ")}] >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let page = 1; page <= 8; page++) {
    const stream = `BT /F1 12 Tf 50 750 Td (Exercise ${page}: source page ${page}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5+(page-1)*2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset=>`${String(offset).padStart(10,"0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf));
}

async function main() {
  // Tests never use a developer's configured provider or spend real tokens.
  process.env.OPENAI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
  const sections = textStudySections(material);
  check("exercises become separate, bounded source sections", sections.length === 2 && sections[0].text.includes("heap objects") && !sections[0].text.includes("Isolation"));
  check("line references describe actual source lines", sections[1].reference === "Lines 4–6");
  check("PDF references retain the actual page number", textStudySections(material, 7)[0].reference.startsWith("PDF p. 7"));
  check("empty and malformed drafts are safe", readStudyDrafts("{bad") === null && readStudyDrafts(null) === null);
  const draft = { sectionId: sections[0].id, title: "Thread sharing", instruction: "Solve exercise 1 without notes.", successCriteria: "Name a shared resource correctly.", estimatedMinutes: 15,
    checkQuestion: "What do threads share?", answerQuote: "Threads share heap objects." };
  const grounded = groundedStudyDrafts({items:[draft]}, sections, "file");
  check("drafts attach server-owned source references and excerpts", grounded[0].task.sourceRef === "Lines 1–3" && grounded[0].task.sourceExcerpt === sections[0].text);
  check("a source-backed answer key is retained", grounded[0].task.answerKey === draft.answerQuote);
  check("invented source sections are rejected", groundedStudyDrafts({items:[{...draft,sectionId:"made-up-page"}]}, sections, "file").length === 0);
  const invented = groundedStudyDrafts({items:[{...draft,answerQuote:"Threads share all stacks."}]}, sections, "file")[0];
  check("invented answers cannot become answer keys", !invented.task.answerKey && !invented.task.checkQuestion);
  check("oversized study tasks are rejected", groundedStudyDrafts({items:[{...draft,estimatedMinutes:600}]}, sections, "file").length === 0);
  for (const mode of ["read","solve","recall"] as const) check(`${mode} starts without authoring instructions or an answer key`, !!quickStudyTask(mode,15,"en",{}).successCriteria && !quickStudyTask(mode,15,"en",{}).answerKey);
  assert.throws(()=>quickStudyTask("read",999,"en",{})); checks++;
  const pdf = {filename:"pages.pdf",mimeType:"application/pdf",content:sourcePDF()};
  const pdfFirst = await materialStudyBatch(pdf);
  const pdfNext = await materialStudyBatch(pdf,pdfFirst.nextCursor!);
  check("PDF preparation reads bounded batches of actual pages", pdfFirst.sections.length === 6 && pdfFirst.nextCursor === 7 && pdfNext.sections.length === 2);
  check("later PDF tasks reference their actual source page", pdfNext.sections[0].reference === "PDF p. 7" && pdfNext.sections[0].text.includes("source page 7"));
  check("opening a PDF source targets its referenced page", taskSourceHref(quickStudyTask("read",15,"en",{sourceFileId:"pdf",sourceRef:"PDF p. 7"}),true) === "/api/materials/pdf#page=7");
  const savedFetch = globalThis.fetch;
  const savedKey = process.env.OPENAI_API_KEY; const savedURL = process.env.OPENAI_BASE_URL;
  let requestBody: { messages?: { content: string }[]; max_tokens?: number } = {};
  try {
    process.env.OPENAI_API_KEY = "fixture-key"; process.env.OPENAI_BASE_URL = "https://fixture.invalid/v1";
    globalThis.fetch = async (input, init) => {
      requestBody = await new Request(input,init).json();
      return Response.json({choices:[{message:{content:JSON.stringify({items:[draft]})}}]});
    };
    const generated = await suggestStudyTasks("Operating systems",sections,"en");
    check("the provider path returns structured task suggestions", groundedStudyDrafts(generated,sections,"file").length === 1);
    check("model requests include labelled source data and a bounded output", requestBody.messages?.[1].content.includes(sections[0].id) && requestBody.max_tokens === 4000);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = savedKey;
    if (savedURL === undefined) delete process.env.OPENAI_BASE_URL; else process.env.OPENAI_BASE_URL = savedURL;
  }
  const user = await prisma.user.create({data:{email:`practical-${Date.now()}@example.test`}});
  const other = await prisma.user.create({data:{email:`practical-other-${Date.now()}@example.test`}});
  try {
    const exam = new Date(todayISO()+"T00:00:00Z"); exam.setUTCDate(exam.getUTCDate()+5);
    const course = await prisma.course.create({data:{userId:user.id,name:"Practical study",examDate:exam,studyDays:"0,1,2,3,4,5,6"}});
    const file = await storeMaterial(user.id,course.id,new File([material],"exercises.txt"),"uebung");
    let called = false;
    check("foreign users cannot prepare a source or spend a model call", await prepareStudyDrafts(other.id,file!.id,"en",async()=>{called=true;return {};}) === null && !called);
    const drafts = (await prepareStudyDrafts(user.id,file!.id,"en"))!;
    check("preparation works without AI", drafts.method === "excerpts" && drafts.items.length === 2);
    check("suggestions do not change the plan before review", await prisma.topic.count({where:{courseId:course.id}}) === 0);
    check("prepared suggestions are cached for retry", (await prepareStudyDrafts(user.id,file!.id,"en"))?.id === drafts.id);
    check("foreign users cannot accept suggestions", await acceptStudyDrafts(other.id,file!.id,drafts.id,[drafts.items[0].id]) === null);
    check("stale suggestion versions cannot be accepted", await acceptStudyDrafts(user.id,file!.id,"old-version",[drafts.items[0].id]) === null);
    const selected = [drafts.items[0].id];
    const saved = (await acceptStudyDrafts(user.id,file!.id,drafts.id,selected,true))!;
    check("accepting selected work creates a startable session", !!saved.blockId && await prisma.topic.count({where:{courseId:course.id}}) === 1);
    check("starting a draft preserves its reviewed session length", readStudyProgress((await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).studyProgress)?.sessionMinutes === drafts.items[0].task.estimatedMinutes);
    await acceptStudyDrafts(user.id,file!.id,drafts.id,selected);
    check("retrying acceptance never duplicates a task", await prisma.topic.count({where:{courseId:course.id}}) === 1);
    const block = await prisma.studyBlock.findFirstOrThrow({where:{topicId:saved.topicId,completed:false,kind:"study"}});
    const checkpoint = {blockId:block.id,topicId:saved.topicId,response:"I solved part 1; need to check isolation.",elapsedSeconds:91,updatedAt:new Date().toISOString()};
    check("foreign checkpoints are rejected", await saveStudyCheckpoint(other.id,checkpoint) === null);
    await saveStudyCheckpoint(user.id,checkpoint);
    check("answers and time are saved without completing the task", readStudyProgress((await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).studyProgress)?.elapsedSeconds === 91 && !(await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).done);
    check("a partial checkpoint preserves the chosen duration", readStudyProgress((await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).studyProgress)?.sessionMinutes === 30);
    await saveStudyCheckpoint(user.id,{...checkpoint,response:"old response",updatedAt:new Date(Date.now()-10000).toISOString()});
    check("late autosaves cannot overwrite newer work", readStudyProgress((await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).studyProgress)?.response === checkpoint.response);
    await rebuildSchedule(user.id);
    check("a rebuild changes block IDs while retaining the saved answer", await prisma.studyBlock.count({where:{id:block.id}}) === 0 && readStudyProgress((await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).studyProgress)?.response === checkpoint.response);
    await saveStudyCheckpoint(user.id,{...checkpoint,response:"continued after rebuild",updatedAt:new Date().toISOString()});
    check("an open session can save after its old block was rebuilt", readStudyProgress((await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).studyProgress)?.response === "continued after rebuild");
    const remaining = await prisma.studyBlock.aggregate({where:{topicId:saved.topicId,kind:"study",completed:false},_sum:{minutes:true}});
    const completed = await recordStudyResult(user.id,{blockId:checkpoint.blockId,topicId:saved.topicId,outcome:"complete",response:"",checked:true,actualMinutes:2});
    check("an open task can finish after its block was rebuilt", !!completed);
    check("goal completion credits all remaining task slices for pacing", (await prisma.studyBlock.findUniqueOrThrow({where:{id:completed!.blockId}})).minutes === remaining._sum.minutes);
    const retried = await recordStudyResult(user.id,{blockId:checkpoint.blockId,topicId:saved.topicId,outcome:"complete",response:"",checked:true,actualMinutes:2});
    check("retries using a rebuilt block ID are idempotent", retried?.alreadySaved === true);
    check("quick task results need no written answer or timer completion", (await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).done);
    check("finishing clears the resume checkpoint", (await prisma.topic.findUniqueOrThrow({where:{id:saved.topicId}})).studyProgress === null);
    check("late autosaves cannot reopen a finished attempt", await saveStudyCheckpoint(user.id,{...checkpoint,blockId:completed!.blockId}) === null);
    const nextSelected = await acceptStudyDrafts(user.id,file!.id,drafts.id,drafts.items.map((item)=>item.id),true);
    check("starting reviewed tasks skips goals already met", !!nextSelected?.blockId && nextSelected.topicId !== saved.topicId);
    const legacy = await prisma.topic.create({data:{courseId:course.id,title:"Existing broad topic"}});
    const quick = await startQuickStudy(user.id,{courseId:course.id,topicId:legacy.id,mode:"recall",minutes:15,language:"en"});
    check("an existing topic starts directly with sensible defaults", !!quick?.blockId && !!readStudyTask((await prisma.topic.findUniqueOrThrow({where:{id:legacy.id}})).studyTask));
    check("quick start preserves the chosen session length", readStudyProgress((await prisma.topic.findUniqueOrThrow({where:{id:legacy.id}})).studyProgress)?.sessionMinutes === 15);
    await rebuildSchedule(user.id);
    const practiceInput = {blockId:quick!.blockId!,topicId:legacy.id,outcome:"practice" as const,response:"Need to retry isolation",checked:false,actualMinutes:3};
    await recordStudyResult(user.id,practiceInput);
    await recordStudyResult(user.id,practiceInput);
    check("retrying a practice outcome after a rebuild records one attempt", await prisma.studyBlock.count({where:{topicId:legacy.id,studyResult:{not:null}}}) === 1);
    check("late checkpoints cannot resurrect a finished practice attempt", await saveStudyCheckpoint(user.id,{...checkpoint,blockId:quick!.blockId!,topicId:legacy.id}) === null);
    check("quick start cannot configure someone else's topic", await startQuickStudy(other.id,{courseId:course.id,topicId:legacy.id,mode:"read",minutes:15,language:"en"}) === null);
    const quickFile = {courseId:course.id,fileId:file!.id,mode:"read" as const,minutes:30,language:"en" as const};
    const firstQuick = await startQuickStudy(user.id,quickFile);
    const repeatedQuick = await startQuickStudy(user.id,quickFile);
    check("restarting the same unfinished quick task resumes instead of duplicating", firstQuick?.blockId === repeatedQuick?.blockId);
    const aiFile = await storeMaterial(user.id,course.id,new File([material],"with-ai.txt"),null);
    const aiDrafts = await prepareStudyDrafts(user.id,aiFile!.id,"en",async()=>({items:[draft]}));
    check("valid AI drafts become reviewable source-grounded work", aiDrafts?.method === "ai" && aiDrafts.items[0].task.answerKey === draft.answerQuote);
    const failFile = await storeMaterial(user.id,course.id,new File([material],"ai-unavailable.txt"),null);
    check("AI failure still yields usable source tasks", (await prepareStudyDrafts(user.id,failFile!.id,"en",async()=>{throw new Error("Unavailable");}))?.method === "excerpts");
    const longFile = await storeMaterial(user.id,course.id,new File([Array.from({length:9},(_,i)=>`Exercise ${i+1}: Practice\nExplain concept ${i+1}.`).join("\n")],"long.txt"),null);
    const firstBatch = (await prepareStudyDrafts(user.id,longFile!.id,"en"))!;
    const nextBatch = (await prepareStudyDrafts(user.id,longFile!.id,"en",undefined,true))!;
    check("long documents can advance to later source sections", firstBatch.items.length === 6 && nextBatch.items.length === 3 && nextBatch.items[0].task.sourceExcerpt?.includes("Exercise 7"));
    check("source references remain absolute across batches", nextBatch.items[0].task.sourceRef === "Lines 13–14" && nextBatch.nextCursor === null);
  } finally {
    await prisma.course.deleteMany({where:{userId:{in:[user.id,other.id]}}});
    await prisma.user.deleteMany({where:{id:{in:[user.id,other.id]}}});
  }
  console.log(`\n${checks} practical-study checks passed`);
}
main().then(()=>prisma.$disconnect()).catch(async error=>{console.error(error);await prisma.$disconnect();process.exit(1);});
