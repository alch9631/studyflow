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
  searchParams: Promise<{ courseId?: string }>;
}) {
  const userId = await getCurrentUserId();
  const t = await getT();
  const sp = await searchParams;
  const courseId = typeof sp.courseId === "string" ? sp.courseId : "";

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
  for (const topic of course.topics) {
    const questions = parseQuestions(topic.questions);
    const confidence =
      topic.confidence === "solid" || topic.confidence === "practice" || topic.confidence === "struggling"
        ? topic.confidence
        : null;
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

  return <PracticeSession courseId={course.id} courseName={course.name} cards={cards} />;
}
