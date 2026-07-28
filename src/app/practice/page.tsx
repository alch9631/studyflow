import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { getT } from "@/components/i18n/server";
import PracticeSession, { type PracticeCard } from "./PracticeSession";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Practice",
  description: "Active-recall practice: one self-test question at a time, self-rated to feed your reviews.",
};

/** A stored confidence value, or null when absent/unrecognised. */
function asConfidence(raw: string | null): "solid" | "practice" | "struggling" | null {
  return raw === "solid" || raw === "practice" || raw === "struggling" ? raw : null;
}

/**
 * Pull the drafted mock-exam questions out of a ModuleFile's `analysis` blob.
 * That column is free-form JSON written by the upload action, so every field is
 * treated as untrusted: a hand-edited or older row simply yields no questions
 * instead of throwing on the practice screen.
 */
function parseExamQuestions(raw: string | null): { question: string; topic: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as { examQuestions?: unknown };
    if (!Array.isArray(parsed?.examQuestions)) return [];
    return parsed.examQuestions.flatMap((q) => {
      const question = typeof (q as { question?: unknown })?.question === "string" ? (q as { question: string }).question.trim() : "";
      const topic = typeof (q as { topic?: unknown })?.topic === "string" ? (q as { topic: string }).topic : "";
      return question ? [{ question, topic }] : [];
    });
  } catch {
    return [];
  }
}

/** Parse a topic's stored `questions` JSON (string[]), guarding malformed rows. */
function parseQuestions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((q): q is string => typeof q === "string" && q.trim().length > 0) : [];
  } catch {
    return [];
  }
}

/**
 * AI Practice Mode (/practice?courseId=...).
 *
 * A calm, focused active-recall quiz: a server component that resolves the
 * course (ownership-scoped via `course: { userId }`, so a guessed courseId can
 * never load another user's topics), pulls the AI-generated self-test questions
 * already stored on each topic (`Topic.questions`, a JSON string[]), and flattens
 * them into a per-card queue. Each card carries its owning topicId so the
 * student's self-rating can persist straight to that topic's `confidence` via the
 * existing `setTopicConfidence` action — closing the loop into the spaced-review
 * engine. No questions yet → a gentle empty state that points back to the course
 * (where AI optimization generates them); never a hard block.
 */
export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; examFile?: string }>;
}) {
  const userId = await getCurrentUserId();
  const t = await getT();
  const sp = await searchParams;
  const courseId = typeof sp.courseId === "string" ? sp.courseId : "";
  // Mock-exam mode: practise a past paper instead of the topic self-tests.
  const examFileId = typeof sp.examFile === "string" ? sp.examFile : "";

  // Ownership-scoped: the course (with its topics + questions) loads only if the
  // current user owns it. A missing/foreign/blank id falls through to null.
  const course = courseId
    ? await prisma.course.findFirst({
        where: { id: courseId, userId },
        select: {
          id: true,
          name: true,
          topics: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, questions: true, confidence: true },
          },
        },
      })
    : null;

  if (!course) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <Sparkles className="h-7 w-7 shrink-0 text-brand" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">{t("practice.noCourse")}</h1>
        <p className="max-w-sm text-muted-foreground">{t("practice.noCourseBody")}</p>
        <Link
          href="/courses"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-dark"
        >
          {t("practice.toCourses")}
        </Link>
      </main>
    );
  }

  // Flatten every topic's questions into a single calm queue, one card per
  // question, each tagged with its topic so the self-rating lands on the right
  // confidence. Initial confidence is carried through so re-practising a topic
  // shows where the student last left it.
  const cards: PracticeCard[] = [];

  // MOCK EXAM MODE — questions drafted from an uploaded past/mock exam, stored
  // in that file's analysis blob when it was analyzed. Ownership is enforced
  // through the course we already resolved, so a guessed file id reads nothing.
  let mockExamName = "";
  if (examFileId) {
    const file = await prisma.moduleFile.findFirst({
      where: { id: examFileId, courseId: course.id },
      select: { filename: true, analysis: true },
    });
    const byTitle = new Map(course.topics.map((t) => [t.title.trim().toLowerCase(), t]));
    for (const q of parseExamQuestions(file?.analysis ?? null)) {
      // Attach each question to the topic it tests so the student's self-rating
      // still feeds the spaced-review engine; anything unmatched falls back to
      // the first topic rather than being dropped.
      const topic = byTitle.get(q.topic.trim().toLowerCase()) ?? course.topics[0];
      if (!topic) break;
      cards.push({
        topicId: topic.id,
        topicTitle: q.topic.trim() || topic.title,
        question: q.question,
        confidence: asConfidence(topic.confidence),
      });
    }
    mockExamName = file?.filename ?? "";
  }

  if (!examFileId) for (const topic of course.topics) {
    const questions = parseQuestions(topic.questions);
    const confidence = asConfidence(topic.confidence);
    for (const question of questions) {
      cards.push({ topicId: topic.id, topicTitle: topic.title, question, confidence });
    }
  }

  if (cards.length === 0) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <Sparkles className="h-7 w-7 shrink-0 text-brand" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">{t("practice.emptyTitle")}</h1>
        <p className="max-w-sm text-muted-foreground">{t("practice.emptyBody")}</p>
        <Link
          href={`/courses/${course.id}`}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-dark"
        >
          {t("practice.backToCourse")}
        </Link>
      </main>
    );
  }

  return (
    <PracticeSession
      courseId={course.id}
      courseName={mockExamName || course.name}
      cards={cards}
    />
  );
}
