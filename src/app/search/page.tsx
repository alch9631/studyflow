import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import GlobalSearch, { type SearchItem } from "@/components/GlobalSearch";
import { getT } from "@/components/i18n/server";

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

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{t("search.title")}</h1>
      <GlobalSearch items={items} initialQuery={q ?? ""} />
    </main>
  );
}
