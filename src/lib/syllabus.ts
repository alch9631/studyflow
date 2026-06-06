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
