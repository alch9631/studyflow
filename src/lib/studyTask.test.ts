import "./testDb";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { readStudyTask, validateStudyTask, studySourceUrl } from "./studyTask";
import { storeMaterial, readMaterial, materialResponse } from "./materials";
import { saveStudyTaskForUser, recordStudyResult } from "./studyTaskService";
import { previewSchedule, todayISO, courseOverloadInfo } from "./planService";
import { parsePrefs, studyCapacityByWeekday } from "./timePlacer";
import { getCurrentUserId } from "./devUser";
import { GET as materialGET } from "../app/api/materials/[id]/route";

let checks = 0;
function check(name: string, condition: unknown) { assert.ok(condition, name); checks++; console.log(`  ✓ ${name}`); }
const taskInput = {
  instruction: "Read pages 1–2 and solve exercise 2 without notes.",
  successCriteria: "Explain why threads share memory and processes do not.", estimatedMinutes: 30,
  sourceRef: "Pages 1–2 · exercise 2", checkQuestion: "What do threads share?", answerKey: "Threads share the process address space.",
};

async function main() {
  check("old topics stay unconfigured", readStudyTask(null) === null);
  check("bad stored JSON is safe", readStudyTask("{broken") === null);
  const task = validateStudyTask(taskInput);
  check("task round-trips with its answer key", readStudyTask(JSON.stringify(task))?.answerKey === taskInput.answerKey);
  for (const url of ["javascript:alert(1)", "data:text/html,test", "//evil.example", "https://user:pass@example.com"]) {
    assert.throws(() => studySourceUrl(url)); checks++;
  }
  assert.throws(() => validateStudyTask({ ...taskInput, answerKey: "" })); checks++;
  assert.throws(() => validateStudyTask({ ...taskInput, estimatedMinutes: -10 })); checks++;
  assert.throws(() => validateStudyTask({ ...taskInput, successCriteria: "" })); checks++;
  check("overlapping lectures consume the window once", studyCapacityByWeekday(parsePrefs(JSON.stringify({dayStartMin:540,dayEndMin:720,dailyBudgetMin:180})), [
    {weekday:1,startMin:540,endMin:630},{weekday:1,startMin:600,endMin:660},
  ])[1] === 45);
  check("a fully busy day has zero capacity", studyCapacityByWeekday(parsePrefs(JSON.stringify({dayStartMin:540,dayEndMin:600})), [{weekday:1,startMin:540,endMin:600}])[1] === 0);
  check("a chosen daily budget is respected", studyCapacityByWeekday(parsePrefs(JSON.stringify({dailyBudgetMin:60,dayStartMin:480,dayEndMin:1320})), [])[1] === 60);

  const userId = await getCurrentUserId();
  const user = await prisma.user.update({where:{id:userId},data:{preferences:JSON.stringify({dayStartMin:480,dayEndMin:1320,dailyBudgetMin:360})}});
  const other = await prisma.user.create({data:{email:`study-other-${Date.now()}@example.test`}});
  try {
    const exam = new Date(todayISO()+"T00:00:00Z"); exam.setUTCDate(exam.getUTCDate()+4);
    const course = await prisma.course.create({data:{name:"Study loop",examDate:exam,studyDays:"0,1,2,3,4,5,6",userId:user.id}});
    const foreign = await prisma.course.create({data:{name:"Other course",examDate:exam,userId:other.id}});
    const before = await prisma.studyBlock.count({where:{courseId:course.id}});
    const file = await storeMaterial(user.id, course.id, new File(["Threads share an address space."],"lecture.md",{type:"text/markdown"}),"skript");
    check("material uploads without an AI key", !!file);
    check("uploading alone never changes the plan", await prisma.studyBlock.count({where:{courseId:course.id}}) === before);
    check("another user cannot read original material", await readMaterial(other.id,file!.id) === null);
    check("another user cannot upload into this course", await storeMaterial(other.id,course.id,new File(["x"],"x.txt"),null) === null);
    const stored = await readMaterial(user.id,file!.id);
    const response = materialResponse(stored);
    check("original file bytes can be opened", await response.text() === "Threads share an address space.");
    check("file is private and cannot execute HTML", response.headers.get("X-Content-Type-Options") === "nosniff" && response.headers.get("Cache-Control") === "private, no-store");
    check("legacy analysis-only file has an honest 404", materialResponse({filename:"old.pdf",mimeType:"application/pdf",content:null}).status === 404);
    check("untrusted MIME becomes plain text", materialResponse({filename:"test.html",mimeType:"text/html",content:new TextEncoder().encode("<script>bad</script>")}).headers.get("Content-Type")?.startsWith("text/plain"));
    const topic = await saveStudyTaskForUser(user.id,{courseId:course.id,title:"Threads exercise",task:{...taskInput,sourceFileId:file!.id}});
    check("saving a concrete task creates its plan", !!topic && await prisma.studyBlock.count({where:{courseId:course.id,topicId:topic.id}})>0);
    check("non-owner cannot edit the task", await saveStudyTaskForUser(other.id,{courseId:course.id,topicId:topic!.id,title:"Changed",task:taskInput}) === null);
    const foreignFile = await storeMaterial(other.id,foreign.id,new File(["other"],"other.txt"),null);
    await prisma.moduleFile.update({where:{id:foreignFile!.id},data:{sizeBytes:200*1024*1024}});
    await assert.rejects(()=>storeMaterial(other.id,foreign.id,new File(["one more"],"extra.txt"),null)); checks++;
    check("storage rejection leaves existing materials intact", await prisma.moduleFile.count({where:{courseId:foreign.id}}) === 1);
    const original = await materialGET(new Request(`http://localhost/api/materials/${file!.id}`), {params:Promise.resolve({id:file!.id})});
    check("material route returns the owner's original", original.status === 200 && await original.text() === "Threads share an address space.");
    const forbidden = await materialGET(new Request(`http://localhost/api/materials/${foreignFile!.id}`), {params:Promise.resolve({id:foreignFile!.id})});
    const missing = await materialGET(new Request("http://localhost/api/materials/missing"), {params:Promise.resolve({id:"missing"})});
    check("route hides another user's material as missing", forbidden.status === 404 && await forbidden.text() === await missing.text());
    await assert.rejects(()=>saveStudyTaskForUser(user.id,{courseId:course.id,topicId:topic!.id,title:"Wrong file",task:{...taskInput,sourceFileId:foreignFile!.id}})); checks++;
    const block = await prisma.studyBlock.findFirstOrThrow({where:{courseId:course.id,kind:"study"},orderBy:{date:"asc"}});
    const input = {blockId:block.id,outcome:"practice" as const,response:"Still unsure about isolation",checked:false,actualMinutes:5};
    check("foreign result is rejected", await recordStudyResult(other.id,input) === null);
    await assert.rejects(()=>recordStudyResult(user.id,{...input,outcome:"complete",checked:false})); checks++;
    await recordStudyResult(user.id,input);
    const first = await prisma.studyBlock.findUniqueOrThrow({where:{id:block.id}});
    check("an attempted session stores the actual result", first.completed && JSON.parse(first.studyResult!).outcome === "practice");
    check("needing practice does not finish the task", !(await prisma.topic.findUniqueOrThrow({where:{id:topic!.id}})).done);
    const next = await prisma.studyBlock.findFirst({where:{courseId:course.id,topicId:topic!.id,kind:"study",completed:false}});
    check("needing practice creates real follow-up work", next && next.minutes >= 15);
    const effort = (await prisma.topic.findUniqueOrThrow({where:{id:topic!.id}})).effort;
    await recordStudyResult(user.id,input);
    check("retrying a result does not add more work", (await prisma.topic.findUniqueOrThrow({where:{id:topic!.id}})).effort === effort);
    check("retrying a result preserves the pending follow-up", await prisma.studyBlock.count({where:{id:next!.id}}) === 1);
    await recordStudyResult(user.id,{blockId:next!.id,outcome:"complete",response:"Threads share the process address space.",checked:true,actualMinutes:8});
    check("a checked goal finishes its task", (await prisma.topic.findUniqueOrThrow({where:{id:topic!.id}})).done);
    check("finishing removes the task's pending study", await prisma.studyBlock.count({where:{topicId:topic!.id,kind:"study",completed:false}}) === 0);
    check("completed attempts and their evidence survive replanning", await prisma.studyBlock.count({where:{topicId:topic!.id,completed:true,studyResult:{not:null}}}) === 2);
    const unchecked = await saveStudyTaskForUser(user.id,{courseId:course.id,title:"Time is not a checked goal",task:taskInput});
    await prisma.studyBlock.updateMany({where:{topicId:unchecked!.id,kind:"study"},data:{completed:true}});
    const uncheckedPreview = (await previewSchedule(user.id)).get(course.id)!;
    check("checking off time alone keeps an unchecked task in the plan", uncheckedPreview.blocks.filter(b=>b.topicId===unchecked!.id && b.kind==="study").reduce((sum,b)=>sum+b.minutes,0) >= 15);
    const short = await saveStudyTaskForUser(user.id,{courseId:course.id,title:"Five-minute check",task:{...taskInput,estimatedMinutes:5}});
    check("a new short task retains its five-minute estimate", (await previewSchedule(user.id)).get(course.id)!.blocks.filter(b=>b.topicId===short!.id && b.kind==="study").reduce((sum,b)=>sum+b.minutes,0) === 5);

    // A 60-minute/day topic fits a 6-hour capacity, despite the old 45m soft cap.
    await prisma.topic.create({data:{courseId:course.id,title:"Short-runway topic",effort:240/90,order:1}});
    const proposed = await previewSchedule(user.id);
    check("spacing preference cannot create false impossibility", proposed.get(course.id)?.isOverloaded === false);
    await prisma.course.update({where:{id:course.id},data:{intense:true}});
    check("overload reads current work instead of a stale flag", !(await courseOverloadInfo(course.id)).overloaded);
    check("no study is placed on or after the exam", proposed.get(course.id)!.blocks.every(b=>b.date<exam.toISOString().slice(0,10)));
  } finally {
    await prisma.course.deleteMany({where:{userId:{in:[user.id,other.id]}}});
    await prisma.user.deleteMany({where:{id:{in:[user.id,other.id]}}});
  }
  console.log(`\n${checks} study-loop checks passed`);
}
main().then(()=>prisma.$disconnect()).catch(async error=>{console.error(error);await prisma.$disconnect();process.exit(1);});
