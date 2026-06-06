import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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

  if (p === "openai") {
    const client = new OpenAI();
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
    const client = new Anthropic();
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

  throw new Error("No AI key set — add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env");
}

/** Pull the first JSON object out of a model response (handles stray fences/prose). */
function stripToJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

// ---------------------------------------------------------------------------

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

const SYLLABUS_SYSTEM =
  "You extract a study structure from course material (a syllabus, module handbook, or lecture script). " +
  "Return the course name, the main/final exam date if stated (ISO YYYY-MM-DD, else empty string), " +
  "and an ordered list of the topics/chapters a student must study, each with a relative effort " +
  "(1 = normal, 2 = heavy). Keep titles short. Never invent a date that isn't in the text.";

export async function extractSyllabus(text: string): Promise<ExtractedSyllabus> {
  const parsed = await jsonComplete<ExtractedSyllabus>(
    SYLLABUS_SYSTEM,
    text.slice(0, 120_000),
    SYLLABUS_SCHEMA,
    "syllabus",
  );
  return {
    courseName: parsed.courseName ?? "",
    examDate: parsed.examDate ?? "",
    topics: Array.isArray(parsed.topics)
      ? parsed.topics
          .filter((t) => t && typeof t.title === "string" && t.title.trim())
          .map((t) => ({ title: t.title.trim(), effort: t.effort > 0 ? t.effort : 1 }))
      : [],
  };
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
  return Array.isArray(parsed.items) ? parsed.items : [];
}

const ANALYZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string", description: "1-2 sentence summary of what this material covers" },
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
  required: ["summary", "concepts", "prerequisites", "topics"],
};

const ANALYZE_SYSTEM =
  "You analyze a university module's study material (lecture script/notes). Extract a short summary, " +
  "the key concepts, any prerequisites, and the list of topics a student must master IN THE BEST " +
  "LEARNING ORDER (foundations first). For each topic give a difficulty (1 easy – 3 hard) and an " +
  "estimated study time in minutes. Base everything on the actual content, not just the title.";

export type ModuleAnalysis = {
  summary: string;
  concepts: string[];
  prerequisites: string[];
  topics: { title: string; difficulty: number; estMinutes: number }[];
};

/** Analyze uploaded module content into a structured, plannable breakdown. */
export async function analyzeModuleContent(
  courseName: string,
  text: string,
): Promise<ModuleAnalysis> {
  const parsed = await jsonComplete<ModuleAnalysis>(
    ANALYZE_SYSTEM,
    `Module: ${courseName}\n\nMaterial:\n${text.slice(0, 120_000)}`,
    ANALYZE_SCHEMA,
    "moduleanalysis",
  );
  return {
    summary: parsed.summary ?? "",
    concepts: Array.isArray(parsed.concepts) ? parsed.concepts : [],
    prerequisites: Array.isArray(parsed.prerequisites) ? parsed.prerequisites : [],
    topics: Array.isArray(parsed.topics)
      ? parsed.topics
          .filter((t) => t && typeof t.title === "string" && t.title.trim())
          .map((t) => ({
            title: t.title.trim(),
            difficulty: t.difficulty > 0 ? t.difficulty : 1,
            estMinutes: t.estMinutes > 0 ? t.estMinutes : 60,
          }))
      : [],
  };
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

const SELFTEST_SYSTEM =
  "For each study topic, write 3 short active-recall self-test questions that make the student " +
  "retrieve and explain key ideas (concept understanding, not trivia). Use each topic's exact title.";

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
  return Array.isArray(parsed.items) ? parsed.items : [];
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
  return Array.isArray(parsed.updates) ? parsed.updates : [];
}
