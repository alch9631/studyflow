import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { deleteLecture } from "./actions";
import EmptyState from "@/components/EmptyState";
import ConfirmDialog from "@/components/ConfirmDialog";
import { iconButtonClass } from "@/components/ui";
import AddLectureForm from "./AddLectureForm";
import { getT } from "@/components/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Timetable",
  description: "Your weekly lecture schedule. Add lectures and see your whole week at a glance.",
};

const DAYS = [
  { v: 1, key: "Mo" },
  { v: 2, key: "Tu" },
  { v: 3, key: "We" },
  { v: 4, key: "Th" },
  { v: 5, key: "Fr" },
  { v: 6, key: "Sa" },
  { v: 0, key: "Su" },
] as const;

function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default async function TimetablePage() {
  const userId = await getCurrentUserId();
  const t = await getT();
  const [lectures, courses] = await Promise.all([
    prisma.lecture.findMany({
      where: { userId },
      orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
      select: { id: true, title: true, location: true, weekday: true, startMin: true, endMin: true },
    }),
    prisma.course.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const byDay = new Map<number, typeof lectures>();
  for (const l of lectures) {
    if (!byDay.has(l.weekday)) byDay.set(l.weekday, []);
    byDay.get(l.weekday)!.push(l);
  }

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="mb-4 text-2xl font-bold tracking-tight">{t("timetable.title")}</h1>

      {/* Add a class slot */}
      <AddLectureForm courses={courses} />

      {/* Weekly view */}
      {lectures.length === 0 ? (
        <EmptyState
          emoji="📅"
          title={t("timetable.emptyTitle")}
          description={t("timetable.emptyDesc")}
        />
      ) : (
        <div className="space-y-4">
          {DAYS.filter((d) => byDay.has(d.v)).map((d) => (
            <section key={d.v}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t(`charts.weekdays.${d.key}`)}
              </h2>
              <ul className="space-y-2">
                {byDay.get(d.v)!.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
                  >
                    <span className="shrink-0 whitespace-nowrap text-sm font-medium tabular-nums text-gray-600 dark:text-gray-300">
                      {fmtTime(l.startMin)}–{fmtTime(l.endMin)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.title}</span>
                      {l.location && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">📍 {l.location}</span>
                      )}
                    </span>
                    <ConfirmDialog
                      action={deleteLecture}
                      fields={{ lectureId: l.id }}
                      successMessage={t("timetable.removeSuccess")}
                      errorMessage={t("timetable.removeError")}
                      className="shrink-0"
                      triggerLabel={<X className="h-4 w-4" aria-hidden="true" />}
                      triggerAriaLabel={t("timetable.deleteAria", { title: l.title })}
                      triggerClassName={iconButtonClass(
                        "inline-flex text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-800",
                      )}
                      title={t("timetable.deleteTitle")}
                      message={
                        <>
                          {t("timetable.deleteMsgPre")} <strong>{l.title}</strong>{" "}
                          {t("timetable.deleteMsgPost")}
                        </>
                      }
                      confirmLabel={t("timetable.deleteConfirm")}
                      pendingLabel={t("timetable.removing")}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Calendar sync lives in Settings (CalendarSync → /api/calendar feed);
          link there rather than duplicate the subscribe logic here. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          {t("timetable.syncCalendar")}
        </Link>
        <Link
          href="/today"
          className="inline-block text-sm text-gray-500 hover:underline dark:text-gray-400"
        >
          {t("timetable.backToToday")}
        </Link>
      </div>
    </main>
  );
}
