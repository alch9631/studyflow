import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { toggleBlock } from "../courses/actions";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  course: { name: string; id: string };
};

function BlockRow({ b }: { b: Row }) {
  return (
    <form
      action={toggleBlock}
      className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
    >
      <input type="hidden" name="blockId" value={b.id} />
      <input type="hidden" name="revalidate" value="/today" />
      <button
        type="submit"
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${
          b.completed
            ? "border-green-500 bg-green-500 text-white"
            : "border-gray-300 hover:border-gray-500"
        }`}
        aria-label={b.completed ? "Mark not done" : "Mark done"}
      >
        {b.completed ? "✓" : ""}
      </button>
      <span className="flex-1">
        <span className={b.completed ? "text-gray-400 line-through" : "font-medium"}>
          {b.topicTitle}
        </span>
        <span className="ml-2 text-xs text-gray-400">{b.course.name}</span>
      </span>
      <span className="text-sm text-gray-400">{b.minutes} min</span>
    </form>
  );
}

export default async function TodayPage() {
  const userId = await getCurrentUserId();
  const today = todayISO();
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);

  const blocks = (await prisma.studyBlock.findMany({
    where: { date: { gte: start, lt: end }, course: { userId } },
    include: { course: { select: { name: true, id: true } } },
    orderBy: { minutes: "desc" },
  })) as Row[];

  // If nothing today (e.g. a weekend / non-study day), surface the next study day.
  let nextDate = "";
  let nextBlocks: Row[] = [];
  if (blocks.length === 0) {
    const next = await prisma.studyBlock.findFirst({
      where: { date: { gte: end }, course: { userId } },
      orderBy: { date: "asc" },
    });
    if (next) {
      nextDate = next.date.toISOString().slice(0, 10);
      const ns = new Date(nextDate + "T00:00:00Z");
      const ne = new Date(ns.getTime() + 86400_000);
      nextBlocks = (await prisma.studyBlock.findMany({
        where: { date: { gte: ns, lt: ne }, course: { userId } },
        include: { course: { select: { name: true, id: true } } },
        orderBy: { minutes: "desc" },
      })) as Row[];
    }
  }

  const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
  const doneMin = blocks.filter((b) => b.completed).reduce((s, b) => s + b.minutes, 0);

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-bold tracking-tight">Today</h1>
      <p className="mb-6 text-sm text-gray-500">
        {today}
        {blocks.length > 0 ? ` · ${doneMin}/${totalMin} min done` : ""}
      </p>

      {blocks.length > 0 ? (
        <ul className="space-y-2">
          {blocks.map((b) => (
            <li key={b.id}>
              <BlockRow b={b} />
            </li>
          ))}
        </ul>
      ) : (
        <div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-center text-sm text-gray-500">
            Nothing scheduled today — it&apos;s not a study day. 😎
          </div>
          {nextBlocks.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Next up · {nextDate}
              </h2>
              <ul className="space-y-2">
                {nextBlocks.map((b) => (
                  <li key={b.id}>
                    <BlockRow b={b} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
