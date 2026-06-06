import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { toggleBlock } from "../courses/actions";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const userId = await getCurrentUserId();
  const today = todayISO();
  const start = new Date(today + "T00:00:00Z");
  const end = new Date(start.getTime() + 86400_000);

  const blocks = await prisma.studyBlock.findMany({
    where: {
      date: { gte: start, lt: end },
      course: { userId },
    },
    include: { course: { select: { name: true, id: true } } },
    orderBy: { minutes: "desc" },
  });

  const totalMin = blocks.reduce((s, b) => s + b.minutes, 0);
  const doneMin = blocks
    .filter((b) => b.completed)
    .reduce((s, b) => s + b.minutes, 0);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Today</h1>
        <Link href="/courses" className="text-sm text-gray-500 hover:underline">
          All courses →
        </Link>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        {today} · {doneMin}/{totalMin} min done
      </p>

      {blocks.length === 0 ? (
        <p className="text-gray-500">
          Nothing scheduled today. Enjoy it — or get ahead. 😎
        </p>
      ) : (
        <ul className="space-y-2">
          {blocks.map((b) => (
            <li key={b.id}>
              <form
                action={toggleBlock}
                className="flex items-center gap-3 rounded-xl border border-gray-200 p-3"
              >
                <input type="hidden" name="blockId" value={b.id} />
                <input type="hidden" name="revalidate" value="/today" />
                <button
                  type="submit"
                  className={`flex h-6 w-6 items-center justify-center rounded border ${
                    b.completed
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-gray-300"
                  }`}
                  aria-label={b.completed ? "Mark not done" : "Mark done"}
                >
                  {b.completed ? "✓" : ""}
                </button>
                <span className="flex-1">
                  <span
                    className={
                      b.completed ? "text-gray-400 line-through" : "font-medium"
                    }
                  >
                    {b.topicTitle}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {b.course.name}
                  </span>
                </span>
                <span className="text-sm text-gray-400">{b.minutes} min</span>
              </form>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
