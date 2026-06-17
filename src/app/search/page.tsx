import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import GlobalSearch, { type SearchItem, type SearchStartData } from "@/components/GlobalSearch";
import { getT } from "@/components/i18n/server";
import { daysUntil } from "@/lib/dates";
import { todayISO } from "@/lib/planService";
import { examCountdownLabel } from "@/components/i18n/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Search",
  description: "Find any course, topic or deadline and jump straight to it.",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const userId = await getCurrentUserId();
  const t = await getT();

  // One userId-scoped read of everything searchable. Topics & deadlines come
  // nested under their course so each result can carry the course name (context)
  // and deep-link back into the right course page.
  const courses = await prisma.course.findMany({
    where: { userId },
    orderBy: { examDate: "asc" },
    select: {
      id: true,
      name: true,
      examDate: true,
      topics: { select: { id: true, title: true }, orderBy: { order: "asc" } },
      assignments: {
        select: { id: true, title: true, dueDate: true },
        orderBy: { dueDate: "asc" },
      },
    },
  });

  const items: SearchItem[] = [];
  for (const c of courses) {
    items.push({
      key: `course-${c.id}`,
      type: "course",
      title: c.name,
      href: `/courses/${c.id}`,
      meta: t("search.metaExam", { date: iso(c.examDate) }),
    });
    for (const t of c.topics) {
      items.push({
        key: `topic-${t.id}`,
        type: "topic",
        title: t.title,
        href: `/courses/${c.id}#topic-${t.id}`,
        courseName: c.name,
      });
    }
    for (const a of c.assignments) {
      items.push({
        key: `deadline-${a.id}`,
        type: "deadline",
        title: a.title,
        href: `/courses/${c.id}#deadline-${a.id}`,
        courseName: c.name,
        meta: t("search.metaDue", { date: iso(a.dueDate) }),
      });
    }
  }

  // Pre-typing landing data: a few of the student's own courses to jump back
  // into, plus the next exams ordered by how soon they are. Courses already come
  // sorted by examDate asc, so the first ones are the most relevant.
  const today = todayISO();
  const start: SearchStartData = {
    courses: courses.slice(0, 6).map((c) => ({
      id: c.id,
      name: c.name,
      href: `/courses/${c.id}`,
    })),
    exams: courses
      .map((c) => ({ c, days: daysUntil(c.examDate, today) }))
      .filter(({ days }) => days >= 0)
      .slice(0, 4)
      .map(({ c, days }) => ({
        id: c.id,
        name: c.name,
        href: `/courses/${c.id}`,
        examLabel: examCountdownLabel(t, days),
      })),
  };

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{t("search.title")}</h1>
      <GlobalSearch items={items} initialQuery={q ?? ""} start={start} />
    </main>
  );
}
