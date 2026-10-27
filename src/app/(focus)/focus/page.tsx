import type { Metadata } from "next";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { daysUntil } from "@/lib/dates";
import { prioritizeBlocks } from "@/app/today/cockpit";
import { todayISO } from "@/lib/planService";
import { getT } from "@/components/i18n/server";
import type { FocusBlock } from "@/lib/focusTypes";
import { readStudyTask, readStudyProgress } from "@/lib/studyTask";
import { focusNotesForUser } from "@/lib/focusNotes";
import { sessionLength } from "@/lib/sessionLength";
import PracticalStudySession from "@/components/PracticalStudySession";
import { resolveFocusForUser } from "@/lib/focusSession";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Focus",
  description: "Distraction-free focus mode: one task, a timer, and nothing else.",
};

/** Resolve an owned session; the client starts its clock only when mounted. */
export default async function FocusPage({
  searchParams,
}: {
  searchParams: Promise<{ blockId?: string; topicId?: string; kind?: string; minutes?: string }>;
}) {
  const [userId, t, sp] = await Promise.all([getCurrentUserId(), getT(), searchParams]);

  const today = todayISO();
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);

  const select = {
    id: true,
    topicTitle: true,
    minutes: true,
    completed: true,
    kind: true,
    topicId: true,
    course: { select: { id: true, name: true, examDate: true } },
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
        topicId: string;
        course: { id: string; name: string };
      }
    | null = null;
  const requested = typeof sp.blockId === "string" ? sp.blockId : "";
  if (requested) {
    block = await resolveFocusForUser(userId, { blockId: requested, topicId: typeof sp.topicId === "string" ? sp.topicId : undefined, kind: typeof sp.kind === "string" ? sp.kind : undefined });
  }

  // Resolve the daily queue only when no explicit block was requested. A direct
  // task start does not need to load and rank the rest of the day's work.
  if (!requested) {
    // Today and Focus use the same explainable ordering, including due reviews.
    const candidates = await prisma.studyBlock.findMany({
      where: { date: { gte: start, lt: end }, course: { userId }, completed: false }, select,
    });
    const topics = candidates.length ? await prisma.topic.findMany({ where: { id: { in: candidates.map((candidate) => candidate.topicId) }, course: { userId } },
      select: { id: true, order: true, confidence: true, studyProgress: true } }) : [];
    const queue = prioritizeBlocks(candidates.map((candidate) => {
      const topic = topics.find((item) => item.id === candidate.topicId);
      return { ...candidate, actualMinutes: null, examDays: daysUntil(candidate.course.examDate, today), confidence: topic?.confidence,
        topicOrder: topic?.order, progress: readStudyProgress(topic?.studyProgress) };
    }));
    const next = queue.find((candidate) => candidate.progress) ?? queue[0];
    block = next ? candidates.find((candidate) => candidate.id === next.id)! : null;
  }

  if (!block || block.completed) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center text-foreground">
        <p className="flex items-center gap-2 text-2xl font-semibold">
          {!requested && <PartyPopper className="h-6 w-6 shrink-0 text-brand" aria-hidden="true" />}
          {t(requested ? block?.completed ? "focus.finished" : "focus.unavailable" : "focus.noBlock")}
        </p>
        {!requested && <p className="max-w-sm text-muted-foreground">{t("focus.noBlockBody")}</p>}
        <Link
          href="/today"
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-dark"
        >
          {t("focus.backToToday")}
        </Link>
      </div>
    );
  }

  // Session drafts and original course notes are kept separate.
  const topic = await prisma.topic.findFirst({
    where: { id: block.topicId, courseId: block.course.id, course: { userId } },
    select: { studyTask: true, studyProgress: true },
  });
  const task = readStudyTask(topic?.studyTask);
  const [notes, fileCount] = await Promise.all([
    focusNotesForUser(userId, block.topicId),
    task?.sourceFileId ? prisma.moduleFile.count({
      where: { id: task.sourceFileId, courseId: block.course.id, content: { not: null } },
    }) : 0,
  ]);
  const fileAvailable = fileCount > 0;

  const focusBlock: FocusBlock = {
    id: block.id,
    topicTitle: block.topicTitle,
    minutes: block.minutes,
    completed: block.completed,
    kind: block.kind,
    topicId: block.topicId,
    course: { id: block.course.id, name: block.course.name },
    notes, requestedMinutes: sessionLength(sp.minutes),
    task, fileAvailable, progress: readStudyProgress(topic?.studyProgress),
  };

  // Keyed by block id: if the mounted /focus route ever receives a different
  // block (searchParams change without unmount), the whole session — timer AND
  // seeded note draft — resets for the new block, so one topic's note text can
  // never be saved onto another topic.
  return <PracticalStudySession key={focusBlock.id} block={focusBlock} />;
}
