import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { isFileCategory, type FileCategory } from "./fileCategory";

/**
 * AI extraction layer — provider-flexible. Uses OpenAI if OPENAI_API_KEY is set,
 * otherwise Anthropic if ANTHROPIC_API_KEY is set. Either key turns on the AI
 * features (syllabus/material import, handbook topics, progress parsing).
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

/** Run a structured-JSON completion against whichever provider is configured. */
async function jsonComplete<T>(
  system: string,
  user: string,
  schema: Record<string, unknown>,
  name: string,
): Promise<T> {
  const p = provider();

  // Bounded timeout + a single retry so a stalled provider call fails fast
  // instead of hanging the request (the SDK default is a 10-min timeout × 2
  // retries, which can wedge a server action for minutes behind a proxy).
  const AI_TIMEOUT_MS = 25_000;

  if (p === "openai") {
    const client = new OpenAI({ timeout: AI_TIMEOUT_MS, maxRetries: 1 });
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name, strict: true, schema },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error("No content returned from OpenAI");
    return JSON.parse(raw) as T;
  }

  if (p === "anthropic") {
    const client = new Anthropic({ timeout: AI_TIMEOUT_MS, maxRetries: 1 });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4000,
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

// ---------------------------------------------------------------------------

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
 * blank/whitespace topic titles all collapse to predictable defaults. The exam
 * date is passed through verbatim (this layer doesn't validate date formats —
 * downstream storage does); it only guarantees the shape, not the value.
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
    const title = t.title.trim();
    if (!title) continue;
    const effort = typeof t.effort === "number" && t.effort > 0 ? t.effort : 1;
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
    text.slice(0, 120_000),
    SYLLABUS_SCHEMA,
    "syllabus",
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
 * drops blank-title topics, and clamps non-positive difficulty/estMinutes.
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
    const title = t.title.trim();
    if (!title) continue;
    const difficulty = typeof t.difficulty === "number" && t.difficulty > 0 ? t.difficulty : 1;
    const estMinutes = typeof t.estMinutes === "number" && t.estMinutes > 0 ? t.estMinutes : 60;
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
    `Module: ${courseName}\n\nMaterial:\n${text.slice(0, 120_000)}`,
    ANALYZE_SCHEMA,
    "moduleanalysis",
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
