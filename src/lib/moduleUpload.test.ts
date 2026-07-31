/**
 * Upload-safety tests.
 *
 * Regression: `analyzeModuleUpload` defaulted a missing `mode` field to
 * "replace", and the only uploader in the app (components/ModuleUploadForm)
 * posts just courseId/file/docType. So EVERY real upload took the destructive
 * path: it kept only the topics whose titles the new analysis repeated and
 * hard-deleted the rest, cascade-deleting each one's Note and discarding its
 * done flag, confidence rating and generated questions. Uploading an exercise
 * sheet to a course built from the lecture script wiped the whole course.
 *
 * Run: npx tsx src/lib/moduleUpload.test.ts
 */
import { resolveUploadMode, topicIdsSafeToDelete } from "./moduleUpload";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

console.log("\n=== module upload safety ===\n");

// ---- resolveUploadMode: destructive only when explicitly asked for ---------
check("a missing mode is additive", resolveUploadMode(undefined) === "append");
check("a null mode is additive", resolveUploadMode(null) === "append");
check("an empty mode is additive", resolveUploadMode("") === "append");
check('str()\'s "" for an absent field is additive', resolveUploadMode("") === "append");
check("an explicit append is additive", resolveUploadMode("append") === "append");
check("an explicit replace is destructive", resolveUploadMode("replace") === "replace");
check("whitespace around replace still counts", resolveUploadMode("  replace  ") === "replace");
// Anything we don't recognise must fall to the SAFE side, never the destructive one.
check("an unknown mode is additive", resolveUploadMode("wipe") === "append");
check("a differently-cased replace is not destructive", resolveUploadMode("REPLACE") === "append");
check("a partial match is not destructive", resolveUploadMode("replace-all") === "append");

// ---- topicIdsSafeToDelete: never destroy the student's own work ------------
const dropped = [
  { id: "plain", done: false, confidence: null },
  { id: "done", done: true, confidence: null },
  { id: "rated", done: false, confidence: "struggling" },
  { id: "noted", done: false, confidence: null },
  { id: "studied", done: false, confidence: null },
  { id: "plain2", done: false, confidence: null },
];
const safe = topicIdsSafeToDelete(dropped, ["noted"], ["studied"]);

check("an untouched AI-derived topic may be deleted", safe.includes("plain") && safe.includes("plain2"));
check("a topic the student marked done is kept", !safe.includes("done"));
check("a topic the student rated is kept", !safe.includes("rated"));
check("a topic carrying a note is kept (its note would cascade away)", !safe.includes("noted"));
check("a topic with completed study is kept (its history would orphan)", !safe.includes("studied"));
check("exactly the untouched topics are deletable", safe.length === 2, `got ${JSON.stringify(safe)}`);

// Degenerate / drift inputs must not widen the deletion set.
check("nothing dropped -> nothing deleted", topicIdsSafeToDelete([], [], []).length === 0);
check(
  "an undefined done flag is treated as untouched",
  topicIdsSafeToDelete([{ id: "x" }], [], []).length === 1,
);
check(
  "a topic that is both noted and studied is kept once",
  topicIdsSafeToDelete([{ id: "y" }], ["y"], ["y"]).length === 0,
);
check(
  "duplicate ids in the studied list don't resurrect a topic",
  topicIdsSafeToDelete([{ id: "z" }], [], ["z", "z"]).length === 0,
);

// The whole point: a replace whose analysis matched nothing must not be able to
// wipe a course the student has actually worked in.
const worked = [
  { id: "a", done: true, confidence: null },
  { id: "b", done: false, confidence: "solid" },
  { id: "c", done: false, confidence: null },
];
check(
  "a course full of worked-on topics survives a total-mismatch replace",
  topicIdsSafeToDelete(worked, ["c"], []).length === 0,
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
