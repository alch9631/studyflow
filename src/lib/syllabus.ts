import OpenAI from "openai";

/**
 * AI extraction: turn syllabus / handbook / lecture-script text into a structured
 * course (name, exam date, weighted topics) using OpenAI with structured outputs.
 *
 * Requires OPENAI_API_KEY. Callers should check isSyllabusAIEnabled() first and
 * show a friendly "add your key" message when it's missing.
 */

export type ExtractedSyllabus = {
  courseName: string; // "" if not found
  examDate: string; // ISO YYYY-MM-DD, or "" if not found
  topics: { title: string; effort: number }[];
};

export function isSyllabusAIEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// Structured-output schema — the model is constrained to match this exactly.
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
} as const;

const SYSTEM =
  "You extract a study structure from course material (a syllabus, module handbook, or lecture script). " +
  "Return the course name, the main/final exam date if stated (ISO YYYY-MM-DD, else empty string), " +
  "and an ordered list of the topics/chapters a student must study, each with a relative effort " +
  "(1 = normal, 2 = heavy). Keep titles short. Never invent a date that isn't in the text.";

export async function extractSyllabus(text: string): Promise<ExtractedSyllabus> {
  if (!isSyllabusAIEnabled()) {
    throw new Error("OPENAI_API_KEY is not set — AI extraction is disabled.");
  }
  const client = new OpenAI(); // reads OPENAI_API_KEY from env

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini", // cheap + supports structured outputs; swap to gpt-4o for higher quality
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: text.slice(0, 120_000) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "syllabus", strict: true, schema: SYLLABUS_SCHEMA },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("No content returned from the model");

  const parsed = JSON.parse(raw) as ExtractedSyllabus;
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
