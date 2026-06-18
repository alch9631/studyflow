import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { getT } from "@/components/i18n/server";
import FocusSession, { type FocusBlock } from "./FocusSession";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Focus",
  description: "Distraction-free focus mode — one task, a timer, and nothing else.",
};

/**
 * Distraction-free Focus mode (/focus?blockId=...).
 *
 * A server component that resolves the ONE block to focus on — the explicitly
 * requested block (ownership-scoped) or, failing that, today's next incomplete
 * block in plan order — then hands it to a full-screen client island with a big
 * timer, quick notes, and done/stop. The island renders as a fixed overlay so
 * the global nav chrome is visually out of the way without touching the root
 * layout. Mark-done reuses toggleBlock; notes reuse saveBlockNote.
 */
export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{ blockId?: string }>;
}) {
  const userId = await getCurrentUserId();
  const t = await getT();
  const sp = await searchParams;

  const today = todayISO();
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);

  const select = {
    id: true,
    topicTitle: true,
    minutes: true,
    completed: true,
    kind: true,
    course: { select: { name: true } },
  } as const;

  // The requested block, if any — ownership-scoped via course.userId so a guessed
  // blockId can never load another user's session.
  let block:
    | {
        id: string;
        topicTitle: string;
        minutes: number;
        completed: boolean;
        kind: string;
        course: { name: string };
      }
    | null = null;
  const requested = typeof sp.blockId === "string" ? sp.blockId : "";
  if (requested) {
    block = await prisma.studyBlock.findFirst({
      where: { id: requested, course: { userId } },
      select,
    });
  }

  // Fall back to today's next still-open block in plan order (study before
  // review, longest first) — the same order Today uses for its hero/queue.
  if (!block || block.completed) {
    const next = await prisma.studyBlock.findFirst({
      where: { date: { gte: start, lt: end }, course: { userId }, completed: false },
      orderBy: [{ kind: "desc" }, { minutes: "desc" }],
      select,
    });
    block = next;
  }

  // The block AFTER the current one, to show a calm "up next" line (today only).
  let upNext: { topicTitle: string } | null = null;
  if (block) {
    upNext = await prisma.studyBlock.findFirst({
      where: {
        date: { gte: start, lt: end },
        course: { userId },
        completed: false,
        id: { not: block.id },
      },
      orderBy: [{ kind: "desc" }, { minutes: "desc" }],
      select: { topicTitle: true },
    });
  }

  if (!block) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-white p-8 text-center dark:bg-gray-950">
        <p className="text-2xl font-bold">🎉 {t("focus.noBlock")}</p>
        <p className="max-w-sm text-gray-600 dark:text-gray-400">{t("focus.noBlockBody")}</p>
        <Link
          href="/today"
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground"
        >
          {t("focus.backToToday")}
        </Link>
      </div>
    );
  }

  const focusBlock: FocusBlock = {
    id: block.id,
    topicTitle: block.topicTitle,
    minutes: block.minutes,
    completed: block.completed,
    kind: block.kind,
    course: { name: block.course.name },
  };

  return <FocusSession block={focusBlock} upNextTopic={upNext?.topicTitle ?? null} />;
}
