/**
 * Tests for the syllabus AI-extraction layer. Run: npx tsx src/lib/syllabus.test.ts
 *
 * These exercise only the deterministic, network-free surfaces of syllabus.ts:
 *   • stripToJson    — recovering JSON from messy model output (fences/prose/garbage)
 *   • normalizeSyllabus / normalizeModuleAnalysis — fail-safe coercion of model output
 *   • isSyllabusAIEnabled — provider gating off env keys
 *   • the unconfigured-provider path — every public extractor rejects (no network)
 *
 * No real OpenAI/Anthropic call is ever made: the functional tests run with BOTH
 * provider keys cleared, so provider() short-circuits before any client is built.
 * Env is saved up front and restored in a finally, so the suite is deterministic
 * regardless of the ambient shell environment.
 */
import {
  stripToJson,
  normalizeSyllabus,
  normalizeModuleAnalysis,
  isSyllabusAIEnabled,
  extractSyllabus,
  analyzeModuleContent,
  optimizeStudyPlan,
  generateSelfTests,
  interpretProgress,
  buildProgressUser,
  LANGUAGE_MATCH_INSTRUCTION,
  SYLLABUS_SYSTEM,
  SELFTEST_SYSTEM,
  buildAnalyzeSystem,
  capInput,
  MAX_EXAM_QUESTIONS,
  overBudgetRatio,
} from "./syllabus";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** True if calling fn() never throws (for asserting the "fails safe" contract). */
const noThrow = (fn: () => unknown) => {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
};
/** True if the promise rejects with a message matching re. */
async function rejectsWith(p: Promise<unknown>, re: RegExp): Promise<boolean> {
  try {
    await p;
    return false;
  } catch (e) {
    return re.test(e instanceof Error ? e.message : String(e));
  }
}

// ── stripToJson: recover JSON from messy model output ────────────────────────
check("plain object passes through", JSON.parse(stripToJson('{"a":1}')).a === 1);
check("```json fenced block", JSON.parse(stripToJson('```json\n{"a":1}\n```')).a === 1);
check("``` fenced block without lang", JSON.parse(stripToJson('```\n{"b":2}\n```')).b === 2);
check(
  "prose around a fenced block",
  JSON.parse(stripToJson('Here you go:\n```json\n{"x":true}\n```\nHope it helps')).x === true,
);
check("prose around bare JSON (no fence)", JSON.parse(stripToJson('Sure! {"a":1} done')).a === 1);
check(
  "leading + trailing garbage with braces",
  JSON.parse(stripToJson('xxx {"k":"v"} yyy')).k === "v",
);
check("nested braces kept intact", eq(JSON.parse(stripToJson('{"a":{"b":[1,2]}}')), { a: { b: [1, 2] } }));
check("unicode inside JSON preserved", JSON.parse(stripToJson('{"t":"数学 ✅ Müller"}')).t === "数学 ✅ Müller");

// Injection-ish strings are returned as inert DATA — never executed/interpreted.
check(
  "SQL-ish string stays a plain value",
  JSON.parse(stripToJson(`{"title":"'); DROP TABLE students;--"}`)).title === "'); DROP TABLE students;--",
);
check(
  "HTML/script-ish string stays a plain value",
  JSON.parse(stripToJson('{"title":"<script>alert(1)</script>"}')).title === "<script>alert(1)</script>",
);

// Degenerate inputs: must return a string and NEVER throw (caller's JSON.parse owns validation).
check("no-brace text returned unchanged", stripToJson("just prose, no json") === "just prose, no json");
check("empty string → empty string", stripToJson("") === "");
check("open brace, no close → unchanged", stripToJson("{ broken") === "{ broken");
check("close before open → unchanged", stripToJson("} nope {") === "} nope {");
check("multiple objects → full span (documented behavior)", stripToJson('{"a":1}{"b":2}') === '{"a":1}{"b":2}');
check(
  "stripToJson never throws on a battery of junk",
  noThrow(() =>
    ["", "{", "}", "}{", "```", "```json```", "ünïcödé", "{{{", "null", "[]", "\u0000\u0007"].map(stripToJson),
  ),
);

// ── normalizeSyllabus: fail-safe coercion ────────────────────────────────────
const EMPTY_SYL = { courseName: "", examDate: "", topics: [] };
check(
  "valid object normalizes verbatim",
  eq(
    normalizeSyllabus({ courseName: "Algorithms", examDate: "2026-07-01", topics: [{ title: "Graphs", effort: 2 }] }),
    { courseName: "Algorithms", examDate: "2026-07-01", topics: [{ title: "Graphs", effort: 2 }] },
  ),
);
check("null → safe empty (no throw)", noThrow(() => normalizeSyllabus(null)) && eq(normalizeSyllabus(null), EMPTY_SYL));
check("undefined → safe empty", eq(normalizeSyllabus(undefined), EMPTY_SYL));
check("empty object → safe empty", eq(normalizeSyllabus({}), EMPTY_SYL));
check("missing topics → []", eq(normalizeSyllabus({ courseName: "X" }), { courseName: "X", examDate: "", topics: [] }));
check("topics not an array → []", eq(normalizeSyllabus({ topics: "nope" }), EMPTY_SYL));
check("courseName non-string → ''", normalizeSyllabus({ courseName: 123 }).courseName === "");
check(
  "junk topic entries are dropped",
  eq(
    normalizeSyllabus({ topics: [null, undefined, 5, "str", {}, { title: "" }, { title: "   " }, { title: "  Real  " }] }).topics,
    [{ title: "Real", effort: 1 }],
  ),
);
check(
  "effort clamps: missing/0/neg/non-number/non-finite → 1, sane values preserved, huge capped",
  eq(
    normalizeSyllabus({
      topics: [
        { title: "a" },
        { title: "b", effort: 0 },
        { title: "c", effort: -3 },
        { title: "d", effort: "2" },
        { title: "e", effort: 2 },
        { title: "f", effort: 1.5 },
        { title: "g", effort: 999 },
        { title: "h", effort: Infinity },
        { title: "i", effort: NaN },
        { title: "j", effort: 1e12 },
        { title: "k", effort: 0.01 },
      ],
    }).topics,
    [
      { title: "a", effort: 1 },
      { title: "b", effort: 1 },
      { title: "c", effort: 1 },
      { title: "d", effort: 1 },
      { title: "e", effort: 2 },
      { title: "f", effort: 1.5 },
      { title: "g", effort: 20 }, // capped: effort is a study-time multiplier
      { title: "h", effort: 1 }, // non-finite → default
      { title: "i", effort: 1 }, // NaN → default
      { title: "j", effort: 20 }, // finite but absurd → capped
      { title: "k", effort: 0.25 }, // tiny positive → floor
    ],
  ),
);
check("examDate passed through verbatim (no format validation)", normalizeSyllabus({ examDate: "31/02/2026 maybe?" }).examDate === "31/02/2026 maybe?");
check("examDate non-string → ''", normalizeSyllabus({ examDate: 20260701 }).examDate === "");
check(
  "duplicate topics are preserved (no dedup)",
  normalizeSyllabus({ topics: [{ title: "Loops", effort: 1 }, { title: "Loops", effort: 1 }] }).topics.length === 2,
);
check("unicode title trimmed + preserved", eq(normalizeSyllabus({ topics: [{ title: "  数学 ✅  " }] }).topics, [{ title: "数学 ✅", effort: 1 }]));
check(
  "injection-ish title kept as inert data",
  normalizeSyllabus({ topics: [{ title: "'; DROP TABLE t;--" }] }).topics[0].title === "'; DROP TABLE t;--",
);
const longTitle = "x".repeat(5000);
check(
  "very long title capped at 300 chars (denormalized into every StudyBlock)",
  normalizeSyllabus({ topics: [{ title: longTitle }] }).topics[0].title.length === 300,
);
check(
  "normalizeSyllabus never throws on malformed input",
  noThrow(() => [null, undefined, {}, { topics: 1 }, { topics: [1, null, {}] }, "str", 42, []].map((x) => normalizeSyllabus(x as never))),
);

// ── normalizeModuleAnalysis: fail-safe coercion ──────────────────────────────
const EMPTY_MOD = { summary: "", category: null, concepts: [], prerequisites: [], topics: [], examQuestions: [] };
check("module: null → safe empty", noThrow(() => normalizeModuleAnalysis(null)) && eq(normalizeModuleAnalysis(null), EMPTY_MOD));
check("module: undefined → safe empty", eq(normalizeModuleAnalysis(undefined), EMPTY_MOD));
check("module: empty object → safe empty", eq(normalizeModuleAnalysis({}), EMPTY_MOD));
check("module: summary non-string → ''", normalizeModuleAnalysis({ summary: 7 }).summary === "");
check("module: concepts/prereqs non-array → []", eq(normalizeModuleAnalysis({ concepts: "x", prerequisites: 9 }), EMPTY_MOD));
check("module: concept array preserved", eq(normalizeModuleAnalysis({ concepts: ["recursion", "induction"] }).concepts, ["recursion", "induction"]));
check(
  "module: difficulty/estMinutes clamp (→1 / →60), sane values preserved",
  eq(
    normalizeModuleAnalysis({
      topics: [
        { title: "a" },
        { title: "b", difficulty: 0, estMinutes: 0 },
        { title: "c", difficulty: -1, estMinutes: -5 },
        { title: "d", difficulty: "2", estMinutes: "30" },
        { title: "e", difficulty: 3, estMinutes: 45 },
      ],
    }).topics,
    [
      { title: "a", difficulty: 1, estMinutes: 60 },
      { title: "b", difficulty: 1, estMinutes: 60 },
      { title: "c", difficulty: 1, estMinutes: 60 },
      { title: "d", difficulty: 1, estMinutes: 60 },
      { title: "e", difficulty: 3, estMinutes: 45 },
    ],
  ),
);
check(
  "module: non-finite/absurd difficulty+estMinutes clamped (Infinity/1e12 would poison rebuilds)",
  eq(
    normalizeModuleAnalysis({
      topics: [
        { title: "a", difficulty: Infinity, estMinutes: Infinity },
        { title: "b", difficulty: NaN, estMinutes: NaN },
        { title: "c", difficulty: 999, estMinutes: 1e12 },
      ],
    }).topics,
    [
      { title: "a", difficulty: 1, estMinutes: 60 }, // non-finite → defaults
      { title: "b", difficulty: 1, estMinutes: 60 }, // NaN → defaults
      { title: "c", difficulty: 3, estMinutes: 1800 }, // finite but absurd → capped
    ],
  ),
);
check(
  "module: very long title capped at 300 chars",
  normalizeModuleAnalysis({ topics: [{ title: "y".repeat(5000) }] }).topics[0].title.length === 300,
);
check("module: blank/whitespace titles dropped, real ones trimmed", eq(normalizeModuleAnalysis({ topics: [{ title: "  " }, { title: " Heaps " }] }).topics, [{ title: "Heaps", difficulty: 1, estMinutes: 60 }]));
check("module: unicode + injection title kept", normalizeModuleAnalysis({ topics: [{ title: "  <b>数学</b>  " }] }).topics[0].title === "<b>数学</b>");
check("module: valid category preserved", normalizeModuleAnalysis({ category: "altklausur" }).category === "altklausur");
check("module: junk category → null", normalizeModuleAnalysis({ category: "garbage" }).category === null);
check("module: non-string category → null", normalizeModuleAnalysis({ category: 5 }).category === null);
check(
  "normalizeModuleAnalysis never throws on malformed input",
  noThrow(() => [null, undefined, {}, { topics: 1 }, { topics: [null, 2, {}] }, "str", 42].map((x) => normalizeModuleAnalysis(x as never))),
);

// ── Feature 1: prompts instruct same-language output ─────────────────────────
// The model must write human-readable values in the language of the material
// (German source → German topics). We can't unit-test the model, but we CAN
// assert the prompts carry the language-matching instruction.
check(
  "LANGUAGE_MATCH_INSTRUCTION names same-language + German example",
  /same language/i.test(LANGUAGE_MATCH_INSTRUCTION) && /german/i.test(LANGUAGE_MATCH_INSTRUCTION),
);
check(
  "LANGUAGE_MATCH_INSTRUCTION keeps JSON keys/enum codes English",
  /JSON keys/i.test(LANGUAGE_MATCH_INSTRUCTION) && /english/i.test(LANGUAGE_MATCH_INSTRUCTION),
);
check("SYLLABUS_SYSTEM carries the language instruction", SYLLABUS_SYSTEM.includes(LANGUAGE_MATCH_INSTRUCTION));
check("SELFTEST_SYSTEM asks for same-language questions", /same language/i.test(SELFTEST_SYSTEM));
check(
  "analyze prompt (no type) carries the language instruction",
  buildAnalyzeSystem().includes(LANGUAGE_MATCH_INSTRUCTION),
);
check(
  "analyze prompt (with type) still carries the language instruction",
  buildAnalyzeSystem("skript").includes(LANGUAGE_MATCH_INSTRUCTION),
);

// ── Feature 2: document type shapes the generated topics ─────────────────────
// buildAnalyzeSystem must steer topic generation per the user-chosen type.
check("base analyze prompt mentions learning order", /learning order/i.test(buildAnalyzeSystem()));
check("skript → first-pass learning guidance", /learning/i.test(buildAnalyzeSystem("skript")));
check("slides → learning guidance", /learning/i.test(buildAnalyzeSystem("slides")));
check("uebung → practice-oriented guidance", /practice/i.test(buildAnalyzeSystem("uebung")));
check(
  "altklausur → exam-practice, fewer/heavier guidance",
  /exam-practice/i.test(buildAnalyzeSystem("altklausur")) && /fewer/i.test(buildAnalyzeSystem("altklausur")),
);
check(
  "mockexam → exam-practice, fewer/heavier guidance",
  /exam-practice/i.test(buildAnalyzeSystem("mockexam")) && /fewer/i.test(buildAnalyzeSystem("mockexam")),
);
check(
  "different types produce different prompts (skript ≠ altklausur)",
  buildAnalyzeSystem("skript") !== buildAnalyzeSystem("altklausur"),
);
check(
  "null/undefined type → base prompt (no type guidance, no throw)",
  noThrow(() => buildAnalyzeSystem(null)) && buildAnalyzeSystem(null) === buildAnalyzeSystem(undefined),
);

// ── capInput: fit the material inside the provider's per-request token budget ─
// The regression this guards: a real German lecture PDF tokenizes at ~2 chars
// per token, so the old flat 20k-char cap sent ~10k tokens under a 12k budget
// and every upload 413'd. The cap must be derived from the budget, not guessed.
const ORIG_CAP = process.env.AI_MAX_INPUT_CHARS;
const ORIG_BUDGET = process.env.AI_TOKEN_BUDGET;
const setBudget = (chars?: string, budget?: string) => {
  if (chars === undefined) delete process.env.AI_MAX_INPUT_CHARS;
  else process.env.AI_MAX_INPUT_CHARS = chars;
  if (budget === undefined) delete process.env.AI_TOKEN_BUDGET;
  else process.env.AI_TOKEN_BUDGET = budget;
};
const big = "x".repeat(500_000);
try {
  setBudget(undefined, undefined);
  const dflt = capInput(big).length;
  check("default cap fits a 12k-token budget", dflt > 0 && dflt <= 12_000 * 2);
  check("default cap leaves room for output + framing", dflt <= (12_000 - 2_000 - 800) * 2);
  check("short text is passed through untouched", capInput("kurz") === "kurz");
  check("cap keeps the HEAD of the document", capInput(big + "TAIL").startsWith("xxx"));

  setBudget(undefined, "24000");
  check("a bigger budget allows more material", capInput(big).length > dflt);
  setBudget(undefined, "6000");
  check("a smaller budget allows less material", capInput(big).length < dflt);

  // A budget too small to hold the framing must not compute a negative cap and
  // send nothing — it floors, and the 413-retry path settles the rest.
  setBudget(undefined, "100");
  check("absurdly small budget still sends something", capInput(big).length >= 1_000);

  setBudget("5000", undefined);
  check("AI_MAX_INPUT_CHARS overrides the computed cap", capInput(big).length === 5_000);
  setBudget("0", undefined);
  check("zero/invalid AI_MAX_INPUT_CHARS falls back to the budget", capInput(big).length === dflt);
} finally {
  setBudget(ORIG_CAP, ORIG_BUDGET);
}

// ── overBudgetRatio: read the provider's own numbers off a 413 ────────────────
const tooLarge = Object.assign(new Error(
  "413 Request too large for model `llama-3.3-70b-versatile` in organization `org_x` " +
  "service tier `on_demand` on tokens per minute (TPM): Limit 12000, Requested 14028, " +
  "please reduce your message size and try again.",
), { status: 413 });
check("413 with Limit/Requested → shrink ratio", (overBudgetRatio(tooLarge) ?? 0) > 0.7 && (overBudgetRatio(tooLarge) ?? 1) < 0.8);
check("ratio always undershoots the line", (overBudgetRatio(tooLarge) ?? 1) < 12_000 / 14_028);
check(
  "413 without parseable numbers → halve",
  overBudgetRatio(Object.assign(new Error("too big"), { status: 413 })) === 0.5,
);
// 429 is the per-MINUTE allowance, not request size: shrinking wouldn't help, so
// it must NOT be treated as shrinkable (it stays a transient "try again").
check(
  "429 rate limit is not shrinkable",
  overBudgetRatio(Object.assign(new Error("Limit 12000, Requested 14028"), { status: 429 })) === null,
);
check("500 is not shrinkable", overBudgetRatio(Object.assign(new Error("boom"), { status: 500 })) === null);
check("plain Error is not shrinkable", overBudgetRatio(new Error("nope")) === null);
check("null/undefined are not shrinkable", overBudgetRatio(null) === null && overBudgetRatio(undefined) === null);

// ── mock-exam questions (drafted from an uploaded past paper) ────────────────
// Rendered straight to the student as a practice queue, so malformed model
// output must degrade to "no questions" rather than blank or broken cards.
check("exam questions: valid pair kept", eq(
  normalizeModuleAnalysis({ examQuestions: [{ question: " Derive the transfer function. ", topic: " Laplace " }] }).examQuestions,
  [{ question: "Derive the transfer function.", topic: "Laplace" }],
));
check("exam questions: missing field → []", eq(normalizeModuleAnalysis({}).examQuestions, []));
check("exam questions: non-array → []", eq(normalizeModuleAnalysis({ examQuestions: "nope" as never }).examQuestions, []));
check("exam questions: junk entries dropped", eq(
  normalizeModuleAnalysis({ examQuestions: [null, 5, {}, { question: "" }, { question: "   " }, { question: "Real?", topic: "T" }] as never }).examQuestions,
  [{ question: "Real?", topic: "T" }],
));
check("exam questions: missing topic tolerated", eq(
  normalizeModuleAnalysis({ examQuestions: [{ question: "Q" }] as never }).examQuestions,
  [{ question: "Q", topic: "" }],
));
check("exam questions: capped at MAX_EXAM_QUESTIONS", normalizeModuleAnalysis({
  examQuestions: Array.from({ length: 50 }, (_, i) => ({ question: `Q${i}`, topic: "T" })),
}).examQuestions.length === MAX_EXAM_QUESTIONS);
check("exam questions: absurdly long question is capped", normalizeModuleAnalysis({
  examQuestions: [{ question: "x".repeat(5000), topic: "T" }],
}).examQuestions[0].question.length === 500);
check("mock-exam instruction only asks on exam material",
  /past exam or a mock exam/i.test(buildAnalyzeSystem("altklausur")) && /empty examQuestions array/i.test(buildAnalyzeSystem("skript")));

// ── env-driven provider gating + unconfigured fail-safe (async, isolated env) ─
const ORIG_OPENAI = process.env.OPENAI_API_KEY;
const ORIG_ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const setKeys = (openai?: string, anthropic?: string) => {
  if (openai === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = openai;
  if (anthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = anthropic;
};

(async () => {
  try {
    setKeys(undefined, undefined);
    check("AI disabled when no key set", isSyllabusAIEnabled() === false);
    setKeys("sk-test", undefined);
    check("AI enabled with only OPENAI key", isSyllabusAIEnabled() === true);
    setKeys(undefined, "sk-ant");
    check("AI enabled with only ANTHROPIC key", isSyllabusAIEnabled() === true);
    setKeys("sk-test", "sk-ant");
    check("AI enabled with both keys", isSyllabusAIEnabled() === true);

    // With no provider, every public extractor must reject with a clear error and
    // make NO network call (provider() returns null before any client is built).
    setKeys(undefined, undefined);
    check("extractSyllabus rejects when unconfigured", await rejectsWith(extractSyllabus("anything"), /No AI key/));
    check("analyzeModuleContent rejects when unconfigured", await rejectsWith(analyzeModuleContent("C", "text"), /No AI key/));
    check("optimizeStudyPlan rejects when unconfigured", await rejectsWith(optimizeStudyPlan("C", ["t"], 10), /No AI key/));
    check("generateSelfTests rejects when unconfigured", await rejectsWith(generateSelfTests("C", ["t"]), /No AI key/));
    check("interpretProgress rejects when unconfigured", await rejectsWith(interpretProgress([{ title: "t", done: false }], "done"), /No AI key/));
  } finally {
    setKeys(ORIG_OPENAI, ORIG_ANTHROPIC);
  }

  // ---- buildProgressUser: the model must SEE each topic's current state -----
  // Regression: the prompt used to list bare titles (and the system prompt
  // demanded an answer for every topic), so the model — blind to what was
  // already done — returned done:false for every unmentioned topic and one
  // "finished paging today" un-marked every previously completed topic.
  {
    const prompt = buildProgressUser(
      [
        { title: "Paging", done: false },
        { title: "Scheduling", done: true },
      ],
      "finished paging today",
    );
    check("progress prompt marks an unfinished topic [not done]", prompt.includes("- Paging [not done]"));
    check("progress prompt marks a finished topic [done]", prompt.includes("- Scheduling [done]"));
    check("progress prompt carries the student's update", prompt.includes("finished paging today"));
    check(
      "progress prompt lists state for every topic (none blind)",
      (prompt.match(/\[(?:done|not done)\]/g) ?? []).length === 2,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
