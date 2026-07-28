import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { isFileCategory, type FileCategory } from "./fileCategory";
import { MAX_TOPIC_TITLE_LENGTH } from "./validate";

/**
 * AI extraction layer — provider-flexible. Uses an OpenAI-compatible endpoint if
 * OPENAI_API_KEY is set, otherwise Anthropic if ANTHROPIC_API_KEY is set. Either
 * key turns on the AI features (syllabus/material import, handbook topics,
 * progress parsing).
 *
 * The "openai" branch talks plain OpenAI Chat Completions, so it works against
 * ANY OpenAI-compatible provider — real OpenAI, Groq, Cerebras, OpenRouter,
 * Gemini's compat endpoint — purely from env, no code change to switch:
 *   - OPENAI_API_KEY   the provider's key (sent as the Bearer token)
 *   - OPENAI_BASE_URL  the provider's base URL (e.g. https://api.groq.com/openai/v1);
 *                      unset = real OpenAI
 *   - AI_MODEL         the model id (e.g. llama-3.3-70b-versatile); default gpt-4o-mini
 * Only real OpenAI is asked for strict json_schema output; every other provider
 * uses the portable json_object mode + schema-in-prompt (same as the Anthropic
 * path), which every compatible endpoint honours.
 */

type Provider = "openai" | "anthropic" | null;

function provider(): Provider {
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function isSyllabusAIEnabled(): boolean {
  return provider() !== null;
}

/**
 * Per-call options. `maxTokens` sizes the reserved output (it counts against the
 * provider's per-request token budget, so it is deliberately small for the
 * material-bearing calls). `shrinkable` marks a call whose user message is bulk
 * study material and may therefore be truncated and retried if the provider
 * rejects the request as over-budget — see {@link overBudgetRatio}. Calls whose
 * user message is a LIST (topic titles, a progress note) are never shrinkable:
 * cutting those silently drops topics from the answer.
 */
type CompleteOpts = { maxTokens?: number; shrinkable?: boolean };

/** How many times an over-budget request is retried with less material. */
const MAX_SHRINK_RETRIES = 2;

/** Run a structured-JSON completion against whichever provider is configured. */
async function jsonComplete<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  name: string,
  opts: CompleteOpts = {},
): Promise<T> {
  const p = provider();
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

  if (p === "openai") {
    const baseURL = process.env.OPENAI_BASE_URL?.trim() || undefined;
    const model = process.env.AI_MODEL?.trim() || "gpt-4o-mini";
    // Strict json_schema is an OpenAI-native feature; other compatible providers
    // (Groq/Cerebras/OpenRouter/Gemini) may reject it, so only use it when we're
    // actually talking to real OpenAI (no custom base URL). Everyone else gets
    // portable json_object mode + the schema pinned into the system prompt.
    const nativeSchema = !baseURL;
    const client = new OpenAI({ baseURL });
    const systemContent = nativeSchema
      ? system
      : system +
        "\nRespond with ONLY a single valid JSON object matching this schema, no prose, no code fences:\n" +
        JSON.stringify(schema);

    // Adaptive retry. capInput() sizes the material from an ESTIMATE of the
    // provider's budget; when the estimate is wrong (a denser document, a
    // smaller model limit, a provider we've never measured) the request comes
    // back rejected — and the provider's own error states the real limit and
    // what we actually asked for. Re-cut the material to that measured ratio
    // and retry, so one bad guess degrades to a shorter analysis instead of
    // failing the whole upload.
    let body = user;
    for (let attempt = 0; ; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemContent },
            { role: "user", content: body },
          ],
          response_format: nativeSchema
            ? { type: "json_schema", json_schema: { name, strict: true, schema } }
            : { type: "json_object" },
        });
        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new Error("No content returned from OpenAI-compatible provider");
        return JSON.parse(stripToJson(raw)) as T;
      } catch (e) {
        const ratio = overBudgetRatio(e);
        if (!opts.shrinkable || ratio === null || attempt >= MAX_SHRINK_RETRIES) throw e;
        const next = Math.floor(body.length * ratio);
        if (next < 500 || next >= body.length) throw e;
        console.warn(
          `[ai:${name}] request over the provider's token budget — retrying with ${next} of ${body.length} chars`,
        );
        body = body.slice(0, next);
      }
    }
  }

  if (p === "anthropic") {
    const client = new Anthropic();
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: maxTokens,
      system:
        system +
        "\nRespond with ONLY a single valid JSON object matching this schema, no prose, no code fences:\n" +
        JSON.stringify(schema),
      messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    if (!block?.text) throw new Error("No content returned from Anthropic");
    return JSON.parse(stripToJson(block.text)) as T;
  }

  throw new Error("No AI key set. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env");
}

/** Pull the first JSON object out of a model response (handles stray fences/prose). */
export function stripToJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

/**
 * Token budget for ONE request (prompt + the reserved output). Free provider
 * tiers are the tight constraint: Groq's on-demand llama-3.3-70b allows 12k
 * tokens/minute and charges input + `max_tokens` against a single request, so
 * anything above the line is rejected outright (HTTP 413) and the whole upload
 * fails. Override with `AI_TOKEN_BUDGET` on a paid tier or a roomier provider.
 */
const DEFAULT_TOKEN_BUDGET = 12_000;

/** Fraction of the budget we actually spend — headroom for estimation error. */
const BUDGET_SAFETY = 0.85;

/**
 * Reserved output tokens. Sized to the JSON these prompts actually produce (a
 * summary plus ~20 topics is well under 1k) rather than left generously large:
 * every reserved token is one the input can't use, and on a 12k budget an
 * oversized reservation is what pushes a normal upload over the line.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;

/**
 * Reserved output for the calls that must echo back an ENTIRE list (every topic
 * reordered, three questions per topic). Truncating that output would silently
 * drop topics from a course, so these get the larger reservation — they can
 * afford it, since their input is a list of titles, not bulk material.
 */
const LIST_OUTPUT_TOKENS = 4_000;

/** Rough size of the fixed framing — system prompt + inlined JSON schema. */
const PROMPT_OVERHEAD_TOKENS = 800;

/**
 * Chars per token, measured rather than assumed. English prose runs ~4
 * chars/token, but the material students actually upload — German technical
 * PDFs, dense with compounds, formulae and layout artefacts — measured 1.97
 * against this model's tokenizer. The previous flat 20k-char cap assumed ~4,
 * so it sent ~10k tokens under a 12k budget and still 413'd. Estimating LOW is
 * the safe direction: it trims a little more material than strictly necessary
 * instead of failing the upload outright.
 */
const CHARS_PER_TOKEN = 2;

/**
 * Cap material sent to the model so a big upload doesn't blow the provider's
 * token budget. The head of a document carries the most signal, so truncating
 * the tail degrades gracefully instead of erroring. `AI_MAX_INPUT_CHARS` still
 * overrides the computed cap outright, for pinning a known-good size.
 */
export function capInput(text: string): string {
  const envCap = Number(process.env.AI_MAX_INPUT_CHARS);
  if (Number.isFinite(envCap) && envCap > 0) return text.slice(0, Math.floor(envCap));

  const envBudget = Number(process.env.AI_TOKEN_BUDGET);
  const budget =
    Number.isFinite(envBudget) && envBudget > 0 ? envBudget : DEFAULT_TOKEN_BUDGET;
  const forInput =
    Math.floor(budget * BUDGET_SAFETY) - DEFAULT_MAX_OUTPUT_TOKENS - PROMPT_OVERHEAD_TOKENS;
  // A budget too small to hold the framing would compute a negative cap and cut
  // everything; send a minimal slice instead and let the retry path settle it.
  const cap = Math.max(1_000, forInput * CHARS_PER_TOKEN);
  return text.slice(0, cap);
}

/**
 * Read a provider's "your request is bigger than the budget" rejection and
 * return the fraction of the current material that WOULD have fit, or null if
 * this isn't that kind of error. OpenAI-compatible providers state both numbers
 * in the message ("Limit 12000, Requested 14028"), which is far more reliable
 * than our chars-per-token estimate — it's the tokenizer's own count.
 *
 * Only a single-request-too-large rejection (413) is shrinkable. A 429 means
 * the per-MINUTE allowance is spent: the request size is fine and retrying
 * smaller wouldn't help, so it stays classified as transient ("try again").
 */
export function overBudgetRatio(err: unknown): number | null {
  const status =
    err && typeof err === "object"
      ? (err as { status?: unknown }).status
      : undefined;
  if (status !== 413) return null;
  const msg =
    err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string"
      ? ((err as { message: string }).message)
      : "";
  const limit = Number(msg.match(/Limit\s+(\d+)/i)?.[1]);
  const requested = Number(msg.match(/Requested\s+(\d+)/i)?.[1]);
  if (!Number.isFinite(limit) || !Number.isFinite(requested) || requested <= 0) {
    // Over-budget but unparseable — halve and let the loop converge.
    return 0.5;
  }
  // 0.9 keeps the retry clear of the line rather than landing exactly on it.
  return Math.min(0.9, (limit / requested) * 0.9);
}

// ---------------------------------------------------------------------------

/**
 * Bounds for AI-returned numeric topic fields. The model occasionally returns
 * junk (Infinity, 1e12) which would poison every later plan rebuild — effort is
 * a study-time multiplier and estMinutes feeds effort directly — so the
 * normalizers clamp instead of trusting "any positive number".
 *  - effort: relative weight, ~1 normal; 20 (× MINUTES_PER_EFFORT ≈ 30h) is far
 *    beyond any real single topic.
 *  - estMinutes: per-topic study estimate; 1800 (30h) is the matching ceiling.
 */
const MAX_TOPIC_EFFORT = 20;
const MIN_TOPIC_EFFORT = 0.25;
const MAX_TOPIC_EST_MINUTES = 1800;

/**
 * Clamp an AI-returned number to [min, max]. Missing, non-numeric, non-finite
 * (Infinity/NaN) or non-positive values fall back to `dflt`.
 */
function clampAINumber(value: unknown, dflt: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return dflt;
  return Math.min(max, Math.max(min, value));
}

/**
 * Shared instruction appended to every prompt that produces human-readable text
 * (titles, summaries, concepts, questions…). The model must write those VALUES
 * in the SAME language as the supplied study material — German source material
 * yields German topics, English yields English, etc. The JSON keys/schema and
 * any enum values (e.g. category codes) always stay English; only the free-text
 * values follow the content's language. We never hardcode a target language so
 * the output always matches whatever the student actually uploaded.
 */
export const LANGUAGE_MATCH_INSTRUCTION =
  "IMPORTANT: Write every human-readable value (topic titles, summary, concepts, " +
  "prerequisites, questions) in the SAME language as the study material / content below " +
  "(e.g. German material → German titles and summary, English material → English). " +
  "Do not translate the content's language. Keep the JSON keys and any fixed enum codes " +
  "(such as the category value) exactly as specified in English.";

export type ExtractedSyllabus = {
  courseName: string;
  examDate: string; // ISO YYYY-MM-DD, or ""
  topics: { title: string; effort: number }[];
};

const SYLLABUS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    courseName: { type: "string", description: "Course title, or empty string if unclear" },
    examDate: {
      type: "string",
      description: "Main/final exam date as ISO YYYY-MM-DD, or empty string if not stated",
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          effort: { type: "number", description: "Relative study weight, 1 = normal, 2 = heavy" },
        },
        required: ["title", "effort"],
      },
    },
  },
  required: ["courseName", "examDate", "topics"],
};

export const SYLLABUS_SYSTEM =
  "You extract a study structure from course material (a syllabus, module handbook, or lecture script). " +
  "Return the course name, the main/final exam date if stated (ISO YYYY-MM-DD, else empty string), " +
  "and an ordered list of the topics/chapters a student must study, each with a relative effort " +
  "(1 = normal, 2 = heavy). Keep titles short. Never invent a date that isn't in the text. " +
  LANGUAGE_MATCH_INSTRUCTION;

/**
 * Coerce a raw model object into a safe ExtractedSyllabus. Never throws: a
 * null/undefined/non-object input, missing fields, non-string/array fields, and
 * blank/whitespace topic titles all collapse to predictable defaults. Titles are
 * capped (they're denormalized into every StudyBlock) and efforts clamped to a
 * finite sane range. The exam date is passed through verbatim (this layer
 * doesn't validate date formats — downstream storage does); it only guarantees
 * the shape, not the value.
 */
export function normalizeSyllabus(
  parsed:
    | { courseName?: unknown; examDate?: unknown; topics?: unknown }
    | null
    | undefined,
): ExtractedSyllabus {
  const p = parsed ?? {};
  const rawTopics = Array.isArray(p.topics)
    ? (p.topics as { title?: unknown; effort?: unknown }[])
    : [];
  const topics: { title: string; effort: number }[] = [];
  for (const t of rawTopics) {
    if (!t || typeof t.title !== "string") continue;
    const title = t.title.trim().slice(0, MAX_TOPIC_TITLE_LENGTH);
    if (!title) continue;
    const effort = clampAINumber(t.effort, 1, MIN_TOPIC_EFFORT, MAX_TOPIC_EFFORT);
    topics.push({ title, effort });
  }
  return {
    courseName: typeof p.courseName === "string" ? p.courseName : "",
    examDate: typeof p.examDate === "string" ? p.examDate : "",
    topics,
  };
}

export async function extractSyllabus(text: string): Promise<ExtractedSyllabus> {
  const parsed = await jsonComplete<ExtractedSyllabus>(
    SYLLABUS_SYSTEM,
    capInput(text),
    SYLLABUS_SCHEMA,
    "syllabus",
    { shrinkable: true },
  );
  return normalizeSyllabus(parsed);
}

// ---------------------------------------------------------------------------

const PROGRESS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Exact topic title from the provided list" },
          done: { type: "boolean" },
        },
        required: ["title", "done"],
      },
    },
  },
  required: ["updates"],
};

const PROGRESS_SYSTEM =
  "Given a list of study topics and a student's free-text progress update, decide which topics are " +
  "now done. Use only the exact topic titles provided. done=true for completed topics, done=false " +
  "otherwise. Include every topic in your answer.";

// ---------------------------------------------------------------------------

const OPTIMIZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Exact original topic title, or 'Review: <topic>' for a review session" },
          effort: { type: "number", description: "Difficulty/importance weight, 1 (easy) to 3 (hard)" },
          isReview: { type: "boolean", description: "true for an inserted revision session" },
        },
        required: ["title", "effort", "isReview"],
      },
    },
  },
  required: ["items"],
};

const OPTIMIZE_SYSTEM =
  "You are an expert study planner. Given a course's topics and the days left until the exam, " +
  "return ALL the topics in the best STUDY ORDER (foundational/prerequisite topics first), each " +
  "with an effort weight 1–3 reflecting difficulty and importance. Keep each original topic's title " +
  "EXACTLY as given (isReview=false). Then append a few spaced 'Review: <topic>' revision sessions " +
  "(isReview=true) for the most important/hardest topics, to land near the exam. Don't drop any topic.";

export type OptimizedItem = { title: string; effort: number; isReview: boolean };

export async function optimizeStudyPlan(
  courseName: string,
  topicTitles: string[],
  daysUntilExam: number,
): Promise<OptimizedItem[]> {
  const user =
    `Course: ${courseName}\nDays until exam: ${daysUntilExam}\nTopics:\n` +
    topicTitles.map((t) => "- " + t).join("\n");
  const parsed = await jsonComplete<{ items: OptimizedItem[] }>(
    OPTIMIZE_SYSTEM,
    user,
    OPTIMIZE_SCHEMA,
    "studyplan",
    { maxTokens: LIST_OUTPUT_TOKENS },
  );
  return Array.isArray(parsed?.items) ? parsed.items : [];
}

const ANALYZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "1-2 sentence summary of what this material covers" },
    category: {
      type: "string",
      enum: ["uebung", "altklausur", "slides", "skript", "mockexam", "sonstiges"],
      description:
        "Type of study material: uebung (exercise/problem sheet), altklausur (past exam paper), " +
        "slides (lecture slides/handout), skript (full lecture script/notes), mockexam " +
        "(practice/mock exam), or sonstiges (anything else).",
    },
    concepts: { type: "array", items: { type: "string" }, description: "key concepts" },
    prerequisites: { type: "array", items: { type: "string" } },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          difficulty: { type: "number", description: "1 easy – 3 hard" },
          estMinutes: { type: "number", description: "estimated study minutes to master it" },
        },
        required: ["title", "difficulty", "estMinutes"],
      },
    },
  },
  required: ["summary", "category", "concepts", "prerequisites", "topics"],
};

const ANALYZE_SYSTEM_BASE =
  "You analyze a university module's study material (lecture script/notes). Extract a short summary, " +
  "classify the material's type (uebung / altklausur / slides / skript / mockexam / sonstiges), " +
  "the key concepts, any prerequisites, and the list of topics a student must master IN THE BEST " +
  "LEARNING ORDER (foundations first). For each topic give a difficulty (1 easy – 3 hard) and an " +
  "estimated study time in minutes. Base everything on the actual content, not just the title.";

/**
 * Type-specific guidance that shapes the GENERATED TOPICS for the plan (Feature
 * 2). The user tells us what kind of document they uploaded; we steer the model
 * to produce topics that fit how that material is studied:
 *
 *  • skript / slides → a comprehensive FIRST-PASS LEARNING breakdown (the topics
 *    you work through to learn the subject the first time).
 *  • uebung          → practice/exercise-oriented topics (working problems).
 *  • altklausur / mockexam → a small number of heavier EXAM-PRACTICE items meant
 *    for the run-up to the exam ("Probeklausur durcharbeiten" style). Fewer,
 *    weightier topics so the existing scheduler naturally allots them more time.
 *
 * The instruction is phrased in English (it's a model instruction), but the
 * topic VALUES the model produces still follow the content language via
 * {@link LANGUAGE_MATCH_INSTRUCTION}.
 */
const DOC_TYPE_GUIDANCE: Record<FileCategory, string> = {
  skript:
    "The user uploaded a SKRIPT (full lecture script/notes). Produce a comprehensive first-pass " +
    "LEARNING breakdown: the topics a student must study to understand the subject for the first time, " +
    "in foundations-first order.",
  slides:
    "The user uploaded SLIDES (lecture slides/handout). Produce a comprehensive first-pass LEARNING " +
    "breakdown of the topics covered, in foundations-first order.",
  uebung:
    "The user uploaded an ÜBUNG (exercise/problem sheet). Produce PRACTICE-oriented topics: the skills " +
    "and problem types the student should drill and work through, rather than first-time reading topics.",
  altklausur:
    "The user uploaded an ALTKLAUSUR (past exam paper). Produce a SMALL number of heavier EXAM-PRACTICE " +
    "items meant for the run-up to the exam — e.g. working through the past paper and the question types " +
    "it covers. Prefer FEWER, weightier topics with higher estimated study time over many small ones.",
  mockexam:
    "The user uploaded a MOCKEXAM / Probeklausur (practice exam). Produce a SMALL number of heavier " +
    "EXAM-PRACTICE items meant for the run-up to the exam — e.g. working the mock exam under timed " +
    "conditions and reviewing weak spots. Prefer FEWER, weightier topics over many small ones.",
  sonstiges:
    "The user uploaded material of an unspecified type. Produce a sensible learning breakdown from the " +
    "actual content.",
};

/**
 * Build the analyze-module system prompt. When the caller knows the user-chosen
 * document type we append type-specific topic-shaping guidance; the language
 * instruction is always appended last so produced text matches the content.
 */
export function buildAnalyzeSystem(docType?: FileCategory | null): string {
  const guidance = docType && DOC_TYPE_GUIDANCE[docType] ? " " + DOC_TYPE_GUIDANCE[docType] : "";
  return ANALYZE_SYSTEM_BASE + guidance + " " + LANGUAGE_MATCH_INSTRUCTION;
}

export type ModuleAnalysis = {
  summary: string;
  category: FileCategory | null;
  concepts: string[];
  prerequisites: string[];
  topics: { title: string; difficulty: number; estMinutes: number }[];
};

/**
 * Coerce a raw model object into a safe ModuleAnalysis. Same fail-safe contract
 * as {@link normalizeSyllabus}: never throws, defaults missing/ill-typed fields,
 * drops blank-title topics, caps titles, and clamps difficulty/estMinutes to a
 * finite sane range (Infinity/1e12 from the model must never reach the planner).
 */
export function normalizeModuleAnalysis(
  parsed:
    | {
        summary?: unknown;
        category?: unknown;
        concepts?: unknown;
        prerequisites?: unknown;
        topics?: unknown;
      }
    | null
    | undefined,
): ModuleAnalysis {
  const p = parsed ?? {};
  const rawTopics = Array.isArray(p.topics)
    ? (p.topics as { title?: unknown; difficulty?: unknown; estMinutes?: unknown }[])
    : [];
  const topics: { title: string; difficulty: number; estMinutes: number }[] = [];
  for (const t of rawTopics) {
    if (!t || typeof t.title !== "string") continue;
    const title = t.title.trim().slice(0, MAX_TOPIC_TITLE_LENGTH);
    if (!title) continue;
    const difficulty = clampAINumber(t.difficulty, 1, 1, 3);
    const estMinutes = clampAINumber(t.estMinutes, 60, 1, MAX_TOPIC_EST_MINUTES);
    topics.push({ title, difficulty, estMinutes });
  }
  return {
    summary: typeof p.summary === "string" ? p.summary : "",
    category: isFileCategory(p.category) ? (p.category as FileCategory) : null,
    concepts: Array.isArray(p.concepts) ? (p.concepts as string[]) : [],
    prerequisites: Array.isArray(p.prerequisites) ? (p.prerequisites as string[]) : [],
    topics,
  };
}

/**
 * Analyze uploaded module content into a structured, plannable breakdown.
 *
 * `docType` is the user-chosen document type (skript/slides/uebung/altklausur/
 * mockexam/sonstiges). When provided it steers the GENERATED TOPICS so they fit
 * how that kind of material is studied (see {@link DOC_TYPE_GUIDANCE}); the
 * existing scheduler then spreads those topics/efforts as usual — no planner
 * rewrite needed. Omitted/null → the generic learning breakdown.
 */
export async function analyzeModuleContent(
  courseName: string,
  text: string,
  docType?: FileCategory | null,
): Promise<ModuleAnalysis> {
  const parsed = await jsonComplete<ModuleAnalysis>(
    buildAnalyzeSystem(docType),
    `Module: ${courseName}\n\nMaterial:\n${capInput(text)}`,
    ANALYZE_SCHEMA,
    "moduleanalysis",
    { shrinkable: true },
  );
  return normalizeModuleAnalysis(parsed);
}

const SELFTEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "Exact topic title" },
          questions: { type: "array", items: { type: "string" } },
        },
        required: ["title", "questions"],
      },
    },
  },
  required: ["items"],
};

export const SELFTEST_SYSTEM =
  "For each study topic, write 3 short active-recall self-test questions that make the student " +
  "retrieve and explain key ideas (concept understanding, not trivia). Use each topic's exact title. " +
  "Write the QUESTIONS in the same language as the topic titles below (German topics → German questions).";

export type TopicQuestions = { title: string; questions: string[] };

/** Generate active-recall questions for a course's topics in one call. */
export async function generateSelfTests(
  courseName: string,
  topicTitles: string[],
): Promise<TopicQuestions[]> {
  const user =
    `Course: ${courseName}\nTopics:\n` + topicTitles.map((t) => "- " + t).join("\n");
  const parsed = await jsonComplete<{ items: TopicQuestions[] }>(
    SELFTEST_SYSTEM,
    user,
    SELFTEST_SCHEMA,
    "selftests",
    { maxTokens: LIST_OUTPUT_TOKENS },
  );
  return Array.isArray(parsed?.items) ? parsed.items : [];
}

export async function interpretProgress(
  topics: string[],
  status: string,
): Promise<{ title: string; done: boolean }[]> {
  const user = `Topics:\n${topics.map((t) => "- " + t).join("\n")}\n\nProgress update:\n${status}`;
  const parsed = await jsonComplete<{ updates: { title: string; done: boolean }[] }>(
    PROGRESS_SYSTEM,
    user,
    PROGRESS_SCHEMA,
    "progress",
  );
  return Array.isArray(parsed?.updates) ? parsed.updates : [];
}
