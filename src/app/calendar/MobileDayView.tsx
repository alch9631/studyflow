"use client";

import { useMemo } from "react";
import { Check, ChevronRight, GraduationCap } from "lucide-react";
import { useT } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import { minutesToHHMM } from "@/lib/calendarTime";
import type { CalBlock, CalLecture } from "./WeekCalendar";
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
 *  - the selected day's sessions and lectures in a readable agenda.
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
        <span className="block break-words font-medium text-gray-800 dark:text-gray-100">
          {courseName}
        </span>
        <span className="block text-[12px] text-gray-500 dark:text-gray-400">
          {t("calendar.sessionsCount", { count: String(count) })} ·{" "}
          {formatDuration(t, minutes)}
        </span>
      </span>
      <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-[12px] font-medium text-brand-ink">
        {t("calendar.place")}
      </span>
    </button>
  );
}

/** Separate edit and completion targets, with enough room to read the topic. */
function TimedSummaryRow({ block, onPlace, onToggle }: {
  block: CalBlock;
  onPlace: () => void;
  onToggle: () => void;
}) {
  const t = useT();
  const isReview = block.kind === "review";
  return (
    <li className="flex items-center gap-1 rounded-xl bg-surface p-2 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={block.completed}
        aria-label={`${t(block.completed ? "calendar.markNotDone" : "calendar.markDone")}: ${block.topicTitle}`}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-accent"
      >
        <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${block.completed ? "border-brand bg-brand text-brand-foreground" : "border-input"}`}>
          {block.completed && <Check className="h-4 w-4" aria-hidden="true" />}
        </span>
      </button>
      <button
        type="button"
        onClick={onPlace}
        aria-label={t("calendar.editSession", { topic: block.topicTitle })}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pl-1 pr-2 text-left hover:bg-accent"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium tabular-nums text-muted-foreground">
            {minutesToHHMM(block.startMin!)}–{minutesToHHMM(block.endMin!)}
            {isReview && <> · {t("block.review")}</>}
          </span>
          <span className={`mt-1 block break-words text-sm font-medium ${block.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>
            {block.topicTitle}
          </span>
          <span className="mt-0.5 block break-words text-xs text-muted-foreground">{block.courseName}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * The calm mobile overview.
 *
 * `weekUnplaced` are every day-granular (timeless) block across the whole shown
 * week — grouped here by course. `dayTimed` are the selected day's already-timed
 * sessions. Auto-arrange, editing, and completion use the parent's actions.
 */
export default function MobileDayView({
  weekUnplaced,
  dayTimed,
  dayLectures,
  isArranging,
  onAutoArrange,
  onPlace,
  onToggle,
}: {
  weekUnplaced: CalBlock[];
  dayTimed: CalBlock[];
  dayLectures: CalLecture[];
  isArranging: boolean;
  onAutoArrange: () => void;
  onPlace: (target: PlacementTarget) => void;
  onToggle: (block: CalBlock) => void;
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
  const agenda = useMemo(
    () => [
      ...dayTimed.map((block) => ({ kind: "session" as const, startMin: block.startMin!, block })),
      ...dayLectures.map((lecture) => ({ kind: "lecture" as const, startMin: lecture.startMin, lecture })),
    ].sort((a, b) => a.startMin - b.startMin),
    [dayTimed, dayLectures],
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
      ) : dayTimed.length > 0 ? (
        <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
          {t("calendar.allArrangedMobile")}
        </div>
      ) : null}

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

      {/* The selected day's sessions and lectures share the same time order. */}
      <div>
        <h3 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {t("calendar.thisDay")}
        </h3>
        {agenda.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {agenda.map((item) => item.kind === "session" ? (
              <TimedSummaryRow
                key={item.block.id}
                block={item.block}
                onPlace={() => onPlace({ kind: "block", block: item.block })}
                onToggle={() => onToggle(item.block)}
              />
            ) : (
              <li key={`lecture-${item.lecture.id}`} className="flex items-start gap-3 rounded-xl bg-surface-muted px-4 py-4">
                <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs tabular-nums text-muted-foreground">{minutesToHHMM(item.lecture.startMin)}–{minutesToHHMM(item.lecture.endMin)} · {t("calendar.lecture")}</span>
                  <span className="mt-1 block break-words text-sm font-medium">{item.lecture.title}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-surface-muted px-4 py-5 text-sm text-muted-foreground">{t("calendar.noTimedToday")}</p>
        )}
      </div>
    </div>
  );
}
