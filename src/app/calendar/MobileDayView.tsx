"use client";

import { useMemo } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import { minutesToHHMM } from "@/lib/calendarTime";
import type { CalBlock } from "./WeekCalendar";
import type { PlacementTarget } from "./PlacementSheet";

/**
 * Mobile "Overview" — a calm planning surface, not a wall of draggable blocks.
 *
 * Dragging is weak on touch, so the mobile default is a *placement* surface:
 *  - a calm header that names how many sessions still need a time, with one
 *    primary path (Auto-arrange) and one manual path (Place manually);
 *  - the unplaced work shown as a few GROUPED-BY-COURSE summary rows
 *    ("OS · 9 sessions · 3h 23m") rather than one card per session — tapping a
 *    row opens the placement sheet for that whole course;
 *  - the selected day's already-timed sessions as a quiet, read-only summary.
 *
 * No drag, no resize here — precise drag placement is desktop-only. The PRIMARY
 * action is one-tap "Auto-arrange my week"; placing by hand (the placement sheet)
 * is the secondary refinement path.
 */

function formatDuration(t: ReturnType<typeof useT>, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t("calendar.durMin", { m: String(m) });
  if (m === 0) return t("calendar.durHour", { h: String(h) });
  return t("calendar.durHourMin", { h: String(h), m: String(m) });
}

/** One course's unplaced sessions, summarised as a single tappable row. */
function CourseSummaryRow({
  courseName,
  count,
  minutes,
  onPlace,
}: {
  courseName: string;
  count: number;
  minutes: number;
  onPlace: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onPlace}
      className="flex w-full items-center gap-3 rounded-xl bg-white px-3 py-3 text-left shadow-sm transition-colors hover:bg-gray-50 dark:bg-gray-800/60 dark:hover:bg-gray-800"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-gray-800 dark:text-gray-100">
          {courseName}
        </span>
        <span className="block text-[12px] text-gray-500 dark:text-gray-400">
          {t("calendar.sessionsCount", { count: String(count) })} ·{" "}
          {formatDuration(t, minutes)}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-[12px] font-medium text-brand">
        {t("calendar.place")}
      </span>
    </button>
  );
}

/** A quiet read-only line for one already-timed session. */
function TimedSummaryRow({ block }: { block: CalBlock }) {
  const isReview = block.kind === "review";
  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[12px] leading-tight ${
        block.completed ? "opacity-50" : ""
      }`}
    >
      <span className="w-[80px] shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
        {minutesToHHMM(block.startMin!)}–{minutesToHHMM(block.endMin!)}
      </span>
      <span
        className={`min-w-0 flex-1 truncate ${
          block.completed ? "line-through" : ""
        } ${isReview ? "text-emerald-700 dark:text-emerald-300" : "text-gray-800 dark:text-gray-100"}`}
      >
        {block.topicTitle}
      </span>
      <span className="min-w-0 max-w-[38%] truncate text-gray-500 dark:text-gray-400">
        {block.courseName}
      </span>
    </div>
  );
}

/**
 * The calm mobile overview.
 *
 * `weekUnplaced` are every day-granular (timeless) block across the whole shown
 * week — grouped here by course. `dayTimed` are the selected day's already-timed
 * sessions, shown as a quiet read-only summary. Auto-arrange and Place-manually
 * are wired by the parent.
 */
export default function MobileDayView({
  weekUnplaced,
  dayTimed,
  isArranging,
  onAutoArrange,
  onPlace,
}: {
  weekUnplaced: CalBlock[];
  dayTimed: CalBlock[];
  isArranging: boolean;
  onAutoArrange: () => void;
  onPlace: (target: PlacementTarget) => void;
}) {
  const t = useT();

  // Group the week's unplaced sessions by course → one summary row per course.
  const courseGroups = useMemo(() => {
    const m = new Map<
      string,
      { courseId: string; courseName: string; blocks: CalBlock[]; minutes: number }
    >();
    for (const b of weekUnplaced) {
      const g = m.get(b.courseId) ?? {
        courseId: b.courseId,
        courseName: b.courseName,
        blocks: [],
        minutes: 0,
      };
      g.blocks.push(b);
      g.minutes += b.minutes;
      m.set(b.courseId, g);
    }
    return [...m.values()].sort((a, b) => a.courseName.localeCompare(b.courseName));
  }, [weekUnplaced]);

  const unplacedCount = weekUnplaced.length;
  const sortedTimed = useMemo(
    () => [...dayTimed].sort((a, b) => a.startMin! - b.startMin!),
    [dayTimed],
  );

  return (
    <div>
      {/* ── Calm header: the build-itself promise. The PRIMARY action is one-tap
          "Auto-arrange my week"; placing by hand is the quiet secondary path. ── */}
      {unplacedCount > 0 ? (
        <div className="mb-4 rounded-2xl bg-brand/5 px-4 py-4">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
            {unplacedCount === 1
              ? t("calendar.sessionWaiting")
              : t("calendar.sessionsWaiting", { count: String(unplacedCount) })}
          </p>
          <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
            {t("calendar.autoArrangeWeekHint")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onAutoArrange}
              disabled={isArranging}
            >
              {isArranging
                ? t("calendar.autoArrangeBuilding")
                : t("calendar.autoArrangeWeek")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isArranging}
              onClick={() => {
                // Refinement path: open the sheet for the first course's unplaced
                // sessions; the per-course rows below place the rest.
                const g = courseGroups[0];
                if (g)
                  onPlace({
                    kind: "course",
                    courseId: g.courseId,
                    courseName: g.courseName,
                    blocks: g.blocks,
                  });
              }}
            >
              {t("calendar.placeManually")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          {t("calendar.allArranged")}
        </div>
      )}

      {/* ── Grouped-by-course summaries of what still needs a time ── */}
      {courseGroups.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t("calendar.toPlace")}
          </h3>
          <div className="flex flex-col gap-2">
            {courseGroups.map((g) => (
              <CourseSummaryRow
                key={g.courseId}
                courseName={g.courseName}
                count={g.blocks.length}
                minutes={g.minutes}
                onPlace={() =>
                  onPlace({
                    kind: "course",
                    courseId: g.courseId,
                    courseName: g.courseName,
                    blocks: g.blocks,
                  })
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Quiet read-only summary of the selected day's timed sessions ── */}
      <div>
        <h3 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("calendar.thisDay")}
        </h3>
        {sortedTimed.length > 0 ? (
          <div className="flex flex-col">
            {sortedTimed.map((b) => (
              <TimedSummaryRow key={b.id} block={b} />
            ))}
          </div>
        ) : (
          <p className="px-1 py-2 text-[12px] text-gray-400">{t("calendar.noTimedToday")}</p>
        )}
      </div>
    </div>
  );
}
