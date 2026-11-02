import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getCurrentUserId } from "@/lib/devUser";
import { getT } from "@/components/i18n/server";
import { practiceForUser } from "@/lib/practice";
import PracticeSession from "./PracticeSession";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Practice",
  description: "Active-recall practice: one self-test question at a time, self-rated to feed your reviews.",
};

/** Both clients use one owned, source-backed queue, including uploaded past papers. */
export default async function PracticePage({ searchParams }: {
  searchParams: Promise<{ courseId?: string; examFile?: string }>;
}) {
  const [userId, t, sp] = await Promise.all([getCurrentUserId(), getT(), searchParams]);
  const data = typeof sp.courseId === "string" && sp.courseId
    ? await practiceForUser(userId, sp.courseId, typeof sp.examFile === "string" ? sp.examFile : "") : null;
  if (!data || !data.cards.length) {
    const missing = !data;
    return <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center">
      <Sparkles className="h-7 w-7 shrink-0 text-brand" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{t(missing ? "practice.noCourse" : "practice.emptyTitle")}</h1>
      <p className="max-w-sm text-muted-foreground">{t(missing ? "practice.noCourseBody" : "practice.emptyBody")}</p>
      <Link href={data ? `/courses/${data.courseId}` : "/courses"} className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand-dark">
        {t(missing ? "practice.toCourses" : "practice.backToCourse")}
      </Link>
    </main>;
  }
  return <PracticeSession courseId={data.courseId} courseName={data.courseName} cards={data.cards} />;
}
