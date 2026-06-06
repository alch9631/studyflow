import Anthropic from "@anthropic-ai/sdk";

/**
 * Day 6 — the "wow". Turn a pasted syllabus into a structured course using
 * Claude with structured outputs (guaranteed-shape JSON). v1 takes pasted text;
 * PDF upload is a later follow-up (keeps this dependency-light).
 *
 * Requires ANTHROPIC_API_KEY. Callers should check isSyllabusAIEnabled() first
 * and show a friendly "add your key" message when it's missing.
 */

export type ExtractedSyllabus = {
  courseName: string; // "" if not found
  examDate: string; // ISO YYYY-MM-DD, or "" if not found
  topics: { title: string; effort: number }[];
};

export function isSyllabusAIEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// Structured-output schema — the API constrains the response to match this.
const SYLLABUS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    courseName: { type: "string", description: "Course title, or empty string if unclear" },
    examDate: {
      type: "string",
      description: "Final/main exam date as ISO YYYY-MM-DD, or empty string if not stated",
    },
    topics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          effort: {
            type: "number",
            description: "Relative study weight, 1 = normal, 2 = heavy/hard. Default 1.",
          },
        },
        required: ["title", "effort"],
      },
    },
  },
  required: ["courseName", "examDate", "topics"],
} as const;

const SYSTEM = [
  "You extract a study structure from a course syllabus.",
  "Return the course name, the main/final exam date if one is stated (ISO YYYY-MM-DD, else empty string),",
  "and an ordered list of the topics/chapters/weeks a student must study.",
  "Estimate each topic's relative effort (1 = normal, 2 = heavy). Keep titles short.",
  "If something isn't in the text, leave it empty — do not invent dates.",
].join(" ");

export async function extractSyllabus(text: string): Promise<ExtractedSyllabus> {
  if (!isSyllabusAIEnabled()) {
    throw new Error("ANTHROPIC_API_KEY is not set — AI syllabus import is disabled.");
  }
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

  // Model: claude-opus-4-8 (best extraction). For a cheaper run at scale,
  // claude-haiku-4-5 also supports structured outputs — swap the id below.
  const params = {
    model: "claude-opus-4-8",
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user" as const, content: text.slice(0, 100_000) }],
    output_config: { format: { type: "json_schema", schema: SYLLABUS_SCHEMA } },
  };

  // Cast: output_config is the canonical structured-output param; cast keeps us
  // robust across SDK minor versions that may not yet type it.
  const response = await client.messages.create(params as never);

  const textBlock = (response as { content: { type: string; text?: string }[] }).content.find(
    (b) => b.type === "text",
  );
  if (!textBlock?.text) throw new Error("No content returned from the model");

  const parsed = JSON.parse(textBlock.text) as ExtractedSyllabus;
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
