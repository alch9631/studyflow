"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useT } from "@/components/i18n/I18nProvider";
import { minutesToHHMM } from "@/lib/calendarTime";
import type { CalBlock } from "./WeekCalendar";

/**
 * Mobile "Overview" — a compact, low-overwhelm read of one day.
 *
 * Timed blocks are bucketed into Morning / Afternoon / Evening; day-granular
 * blocks sit in a visually distinct "Needs placing" section (a dashed droppable
 * lane). Each part-of-day group shows full block cards while small, and collapses
 * to a one-line summary with a "+N more" toggle once it gets crowded — so a busy
 * day reads as a few chips instead of a tall wall. Drag-to-time still lives in the
 * full Timeline view; this overview is for scanning and tap-to-complete.
 */

// Part-of-day cut points (minutes-of-day), matching common day phrasing.
const MORNING_END = 12 * 60; // 12:00
const AFTERNOON_END = 17 * 60; // 17:00

// Above this many blocks a group renders compressed (chips + "+N more") instead
// of full detail. Few blocks → full cards; many → a tidy summary.
const COMPACT_THRESHOLD = 3;

type Part = "morning" | "afternoon" | "evening";

function partOf(startMin: number): Part {
  if (startMin < MORNING_END) return "morning";
  if (startMin < AFTERNOON_END) return "afternoon";
  return "evening";
}

/** A single timed block as a compact chip (used in the compressed view). */
function BlockChip({
  block,
  onToggle,
}: {
  block: CalBlock;
  onToggle: (block: CalBlock) => void;
}) {
  const t = useT();
  const isReview = block.kind === "review";
  return (
    <button
      type="button"
      onClick={() => onToggle(block)}
      aria-pressed={block.completed}
      title={`${minutesToHHMM(block.startMin!)}–${minutesToHHMM(block.endMin!)} · ${block.topicTitle} · ${block.courseName}`}
      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[12px] leading-tight ${
        isReview
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-100"
          : "border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      } ${block.completed ? "opacity-50 line-through" : ""}`}
    >
      <span className="w-[78px] shrink-0 tabular-nums text-[11px] text-gray-500 dark:text-gray-400">
        {minutesToHHMM(block.startMin!)}–{minutesToHHMM(block.endMin!)}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{block.topicTitle}</span>
      <span className="min-w-0 max-w-[40%] truncate text-[11px] text-gray-500 dark:text-gray-400">
        {block.courseName}
      </span>
      <span
        aria-hidden
        className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] leading-none ${
          block.completed
            ? "border-green-500 bg-green-500 text-white"
            : "border-gray-300 text-transparent dark:border-gray-600"
        }`}
      >
        ✓
      </span>
      <span className="sr-only">
        {block.completed ? t("calendar.markNotDone") : t("calendar.markDone")}
      </span>
    </button>
  );
}

/** One part-of-day section: full chips when small, compressed + expand when busy. */
function PartGroup({
  part,
  blocks,
  onToggle,
}: {
  part: Part;
  blocks: CalBlock[];
  onToggle: (block: CalBlock) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  if (blocks.length === 0) return null;

  const label =
    part === "morning"
      ? t("calendar.morning")
      : part === "afternoon"
        ? t("calendar.afternoon")
        : t("calendar.evening");

  const compact = blocks.length > COMPACT_THRESHOLD && !expanded;
  const visible = compact ? blocks.slice(0, COMPACT_THRESHOLD) : blocks;
  const hidden = blocks.length - visible.length;

  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center justify-between px-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </h3>
        <span className="text-[10px] tabular-nums text-gray-400">{blocks.length}</span>
      </div>
      <div className="flex flex-col gap-1">
        {visible.map((b) => (
          <BlockChip key={b.id} block={b} onToggle={onToggle} />
        ))}
      </div>
      {compact && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1 w-full rounded-md border border-dashed border-gray-300 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          {t("calendar.showMore", { count: String(hidden) })}
        </button>
      )}
      {!compact && expanded && blocks.length > COMPACT_THRESHOLD && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1 w-full rounded-md border border-dashed border-gray-300 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          {t("calendar.showLess")}
        </button>
      )}
    </div>
  );
}

/** The "Needs placing" lane — day-granular blocks that still have no time. */
function NeedsPlacing({
  dayISO,
  blocks,
  onToggle,
}: {
  dayISO: string;
  blocks: CalBlock[];
  onToggle: (block: CalBlock) => void;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({
    id: `${dayISO}|unscheduled`,
    data: { dayISO, startMin: null },
  });
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between px-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
          {t("calendar.needsPlacing")}
        </h3>
        {blocks.length > 0 && (
          <span className="text-[10px] tabular-nums text-amber-500">{blocks.length}</span>
        )}
      </div>
      <div
        ref={setNodeRef}
        aria-label={t("calendar.needsPlacing")}
        className={`flex min-h-12 flex-col gap-1 rounded-md border border-dashed p-1.5 ${
          isOver
            ? "border-brand bg-brand/10"
            : "border-amber-300 bg-amber-50/60 dark:border-amber-700/60 dark:bg-amber-900/10"
        }`}
      >
        {blocks.length === 0 ? (
          <p className="px-1 py-1 text-[11px] text-gray-400">{t("calendar.needsPlacingEmpty")}</p>
        ) : (
          blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onToggle(b)}
              aria-pressed={b.completed}
              className={`flex w-full items-center gap-2 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-left text-[12px] leading-tight dark:border-amber-800/50 dark:bg-gray-800 ${
                b.completed ? "opacity-50 line-through" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{b.topicTitle}</span>
              <span className="min-w-0 max-w-[40%] truncate text-[11px] text-gray-500 dark:text-gray-400">
                {b.courseName}
              </span>
              <span className="shrink-0 tabular-nums text-[11px] text-gray-400">{b.minutes}m</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * The grouped, compressed mobile overview for one day. `timed` are blocks with a
 * start/end; `unscheduled` are day-granular blocks for the same day.
 */
export default function MobileDayView({
  dayISO,
  timed,
  unscheduled,
  onToggle,
}: {
  dayISO: string;
  timed: CalBlock[];
  unscheduled: CalBlock[];
  onToggle: (block: CalBlock) => void;
}) {
  const t = useT();
  const byPart: Record<Part, CalBlock[]> = { morning: [], afternoon: [], evening: [] };
  for (const b of [...timed].sort((a, b) => a.startMin! - b.startMin!)) {
    byPart[partOf(b.startMin!)].push(b);
  }
  const hasTimed = timed.length > 0;

  return (
    <div>
      <NeedsPlacing dayISO={dayISO} blocks={unscheduled} onToggle={onToggle} />
      {hasTimed ? (
        <>
          <PartGroup part="morning" blocks={byPart.morning} onToggle={onToggle} />
          <PartGroup part="afternoon" blocks={byPart.afternoon} onToggle={onToggle} />
          <PartGroup part="evening" blocks={byPart.evening} onToggle={onToggle} />
        </>
      ) : (
        <p className="px-1 py-2 text-center text-[12px] text-gray-400">
          {t("calendar.noTimedToday")}
        </p>
      )}
    </div>
  );
}
