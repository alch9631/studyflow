"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, SlidersHorizontal, Check } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useT } from "@/components/i18n/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { updateBlockTime, autoScheduleWeekTimes, toggleBlock } from "../courses/actions";
import {
  dayMinutesToInstant,
  instantToDayMinutes,
  minutesToHHMM,
  clampToDay,
  MINUTES_PER_DAY,
} from "@/lib/calendarTime";
import { layoutDayBlocks } from "@/lib/calendarLayout";
import MobileDayView from "./MobileDayView";
import PlacementSheet, { type PlacementTarget } from "./PlacementSheet";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Visible time window + granularity (configurable here). Rows are SLOT_MIN apart.
const DAY_START_MIN = 6 * 60; // 06:00
const DAY_END_MIN = MINUTES_PER_DAY; // 24:00
const SLOT_MIN = 30;
const SLOT_PX = 34; // height of one 30-min row (comfortable, readable)
const STEP_MIN = 15; // resize granularity
const MIN_DURATION = 15; // smallest block a resize can produce
const DEFAULT_DURATION = 60; // length given to a previously-untimed block on first drop

// "Place the next N" — a calm small batch, not the whole backlog at once.
const PLACE_BATCH = 5;
const BATCH_START_MIN = 9 * 60; // 09:00 — a sensible default start for a batch

const SLOT_COUNT = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;
const GRID_HEIGHT = SLOT_COUNT * SLOT_PX;

export type CalBlock = {
  id: string;
  dayISO: string; // YYYY-MM-DD (the local day the block sits on)
  startMin: number | null; // minutes-of-day, or null when day-granular (unscheduled)
  endMin: number | null;
  topicTitle: string;
  minutes: number;
  kind: string;
  courseId: string;
  courseName: string;
  completed: boolean;
};

/** A recurring lecture shown as fixed, non-interactive grey context. */
export type CalLecture = {
  id: string;
  dayISO: string;
  startMin: number;
  endMin: number;
  title: string;
};

/** An exam-day marker rendered as an all-day banner at the top of its column. */
export type CalExam = {
  courseId: string;
  courseName: string;
  dayISO: string;
};

// A droppable target id is encoded as "day|slot" for a timed slot, or
// "day|unscheduled" for a day's unscheduled lane.
type DropData = { dayISO: string; startMin: number | null };

/**
 * True only on the client, after mount, when the viewport is actually desktop
 * (≥768px — Tailwind's `md`). Starts `false` so SSR and the first client render
 * agree (no hydration mismatch) and the heavy desktop @dnd-kit tree — droppables,
 * day columns, drag overlay — is never instantiated on phones, where the `Issues`
 * badge otherwise flags a mismatch and the work is wasted (mobile has its own
 * placement flow). The desktop grid is mounted only once this flips true.
 */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return isDesktop;
}

/** Humanised block duration ("3h 23m"), via the shared dur* messages. */
function formatDuration(t: ReturnType<typeof useT>, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return t("calendar.durMin", { m: String(m) });
  if (m === 0) return t("calendar.durHour", { h: String(h) });
  return t("calendar.durHourMin", { h: String(h), m: String(m) });
}

function topPx(startMin: number) {
  return ((startMin - DAY_START_MIN) / SLOT_MIN) * SLOT_PX;
}
function heightPx(startMin: number, endMin: number) {
  return Math.max(SLOT_PX / 2, ((endMin - startMin) / SLOT_MIN) * SLOT_PX);
}

/** A draggable block card (used in the timed grid and the unscheduled lane). */
function BlockCard({
  block,
  positioned,
  onToggle,
  onResize,
}: {
  block: CalBlock;
  positioned?: { top: number; height: number; left: string; width: string };
  onToggle?: (block: CalBlock) => void;
  onResize?: (block: CalBlock, clientY: number) => void;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    data: { block },
  });
  const isReview = block.kind === "review";
  const timed = block.startMin != null && block.endMin != null;
  const label = timed
    ? `${minutesToHHMM(block.startMin!)}–${minutesToHHMM(block.endMin!)}`
    : `${block.minutes}m`;

  const style: React.CSSProperties = positioned
    ? {
        position: "absolute",
        top: positioned.top,
        height: positioned.height,
        left: positioned.left,
        width: positioned.width,
      }
    : {};

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/card flex flex-col overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-opacity ${
        isReview
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-100"
          : "border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      } ${block.completed ? "opacity-50" : ""} ${isDragging ? "opacity-30" : ""}`}
    >
      {/* Tap-to-complete: a small ✓ that toggles the block done/undone. */}
      {onToggle && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(block);
          }}
          aria-pressed={block.completed}
          aria-label={block.completed ? t("calendar.markNotDone") : t("calendar.markDone")}
          className={`absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded border leading-none ${
            block.completed
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 bg-white/80 text-transparent hover:text-gray-400 dark:border-gray-600 dark:bg-gray-900/70"
          }`}
        >
          <Check className="h-2.5 w-2.5" aria-hidden="true" />
        </button>
      )}

      {/* Drag surface: the body of the card picks up the dnd-kit listeners. */}
      <button
        type="button"
        aria-label={`${block.topicTitle}, ${block.courseName}, ${label}. ${t("calendar.dragHint")}`}
        title={`${block.topicTitle} · ${block.courseName} · ${label}`}
        className={`flex min-h-0 flex-1 flex-col overflow-hidden pr-4 text-left focus:outline-none focus:ring-2 focus:ring-brand ${
          block.completed ? "line-through" : ""
        }`}
        {...listeners}
        {...attributes}
      >
        <span className="truncate font-medium">{block.topicTitle}</span>
        <span className="truncate text-[10px] text-gray-500 dark:text-gray-400">
          {block.courseName}
        </span>
        <span className="mt-auto text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
          {label}
        </span>
      </button>

      {/* Resize grip: drag the bottom edge to change the block's duration. */}
      {onResize && positioned && (
        <div
          role="separator"
          aria-label={t("calendar.resizeHint")}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onResize(block, e.clientY);
          }}
          className="absolute inset-x-0 bottom-0 z-10 flex h-2 cursor-ns-resize items-end justify-center"
        >
          <span className="mb-0.5 h-0.5 w-5 rounded-full bg-gray-300 opacity-0 transition-opacity group-hover/card:opacity-100 dark:bg-gray-500" />
        </div>
      )}
    </div>
  );
}

/** A 30-min droppable slot inside a day column. */
function TimeSlot({ dayISO, startMin }: { dayISO: string; startMin: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${dayISO}|${startMin}`,
    data: { dayISO, startMin } satisfies DropData,
  });
  const onHour = startMin % 60 === 0;
  return (
    <div
      ref={setNodeRef}
      style={{ height: SLOT_PX }}
      className={`border-b ${onHour ? "border-gray-200 dark:border-gray-800" : "border-gray-100 dark:border-gray-800/40"} ${
        isOver ? "bg-brand/10" : ""
      }`}
    />
  );
}

/** A day's "Unscheduled" droppable lane (day-granular blocks live here). */
function UnscheduledLane({
  dayISO,
  children,
}: {
  dayISO: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({
    id: `${dayISO}|unscheduled`,
    data: { dayISO, startMin: null } satisfies DropData,
  });
  return (
    <div
      ref={setNodeRef}
      aria-label={t("calendar.unscheduled")}
      className={`flex min-h-12 flex-col gap-1 rounded-md border border-dashed p-1 ${
        isOver ? "border-brand bg-brand/10" : "border-gray-200 dark:border-gray-700"
      }`}
    >
      {children}
    </div>
  );
}

/** The fixed grey lecture context block (non-draggable, behind study blocks). */
function LectureBlock({ lecture }: { lecture: CalLecture }) {
  const top = topPx(Math.max(lecture.startMin, DAY_START_MIN));
  const height = heightPx(Math.max(lecture.startMin, DAY_START_MIN), Math.min(lecture.endMin, DAY_END_MIN));
  if (lecture.endMin <= DAY_START_MIN || lecture.startMin >= DAY_END_MIN) return null;
  return (
    <div
      style={{ position: "absolute", top, height, left: 2, right: 2 }}
      className="pointer-events-none z-0 flex flex-col overflow-hidden rounded-md border border-gray-300/70 bg-gray-200/70 px-1.5 py-1 text-[10px] leading-tight text-gray-600 dark:border-gray-600/60 dark:bg-gray-700/40 dark:text-gray-300"
    >
      <span className="truncate font-medium">{lecture.title}</span>
      <span className="truncate tabular-nums">
        {minutesToHHMM(lecture.startMin)}–{minutesToHHMM(lecture.endMin)}
      </span>
    </div>
  );
}

/** The horizontal "now" indicator drawn inside today's column. */
function NowLine({ nowMin }: { nowMin: number }) {
  if (nowMin < DAY_START_MIN || nowMin > DAY_END_MIN) return null;
  return (
    <div
      style={{ position: "absolute", top: topPx(nowMin), left: 0, right: 0 }}
      className="pointer-events-none z-20 flex items-center"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
      <span className="h-px flex-1 bg-red-500" />
    </div>
  );
}

/** A single day column (used by both desktop's 7 columns and mobile's 1). */
function DayColumn({
  dayISO,
  isToday,
  slotStarts,
  dayLectures,
  timed,
  nowMin,
  onToggle,
  onResize,
}: {
  dayISO: string;
  isToday: boolean;
  slotStarts: number[];
  dayLectures: CalLecture[];
  timed: CalBlock[];
  nowMin: number | null;
  onToggle: (block: CalBlock) => void;
  onResize: (block: CalBlock, clientY: number) => void;
}) {
  // Side-by-side overlap layout: lane + lane count per block.
  const laid = layoutDayBlocks(
    timed.map((b) => ({ id: b.id, startMin: b.startMin!, endMin: b.endMin! })),
  );
  const laneById = new Map(laid.map((l) => [l.id, l]));

  return (
    <div
      className={`relative rounded-md border ${
        isToday ? "border-brand/40 bg-brand/5" : "border-gray-200 dark:border-gray-800"
      }`}
      style={{ height: GRID_HEIGHT }}
    >
      {slotStarts.map((m) => (
        <TimeSlot key={m} dayISO={dayISO} startMin={m} />
      ))}
      {dayLectures.map((l) => (
        <LectureBlock key={l.id} lecture={l} />
      ))}
      {timed.map((b) => {
        const lane = laneById.get(b.id);
        const lanes = lane?.lanes ?? 1;
        const idx = lane?.lane ?? 0;
        const widthPct = 100 / lanes;
        return (
          <BlockCard
            key={b.id}
            block={b}
            onToggle={onToggle}
            onResize={onResize}
            positioned={{
              top: topPx(b.startMin!),
              height: heightPx(b.startMin!, b.endMin!),
              left: `calc(${idx * widthPct}% + 2px)`,
              width: `calc(${widthPct}% - ${lanes > 1 ? 3 : 4}px)`,
            }}
          />
        );
      })}
      {isToday && nowMin != null && <NowLine nowMin={nowMin} />}
    </div>
  );
}

/**
 * Calendar v2 — a time-of-day week calendar (Mon–Sun) with week navigation,
 * fixed lecture context, exam markers, tap-to-complete, drag-to-resize, a now
 * line, side-by-side overlap layout, and a responsive single-day mobile view.
 *
 * Props are serializable so the page stays a server component.
 */
export default function WeekCalendar({
  dayISOs,
  todayISO,
  weekStartISO,
  prevWeekISO,
  nextWeekISO,
  blocks,
  lectures,
  exams,
}: {
  dayISOs: string[];
  todayISO: string;
  weekStartISO: string;
  prevWeekISO: string;
  nextWeekISO: string;
  blocks: CalBlock[];
  lectures: CalLecture[];
  exams: CalExam[];
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [isArranging, startArranging] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Gate the desktop 7-column drag grid on a real desktop viewport so its
  // @dnd-kit internals never mount during SSR or on mobile (see useIsDesktop).
  const isDesktop = useIsDesktop();

  // Desktop default is the clean STRUCTURAL view — the week's time shape, no
  // backlog wall. "Planning mode" reveals the full placement tools (the backlog
  // and its drag/expand controls); it stays off until the student opts in.
  const [planningMode, setPlanningMode] = useState(false);
  // Within planning mode, the backlog is still collapsed-by-course by default,
  // with an explicit toggle to expand into the full per-session draggable lanes.
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);

  // Optimistic completed-state overlay so the ✓ toggle feels instant.
  const [doneOverride, setDoneOverride] = useState<Record<string, boolean>>({});
  // Optimistic duration overlay (block id → end minutes) while/after a resize.
  const [endOverride, setEndOverride] = useState<Record<string, number>>({});

  // Mobile selected day: default to today if it's in the shown week, else Monday.
  // When the week changes (new weekStart), reset the selection during render —
  // the "adjust state when a prop changes" pattern, so no setState-in-effect.
  const defaultDay = dayISOs.includes(todayISO) ? todayISO : dayISOs[0];
  const [selectedDay, setSelectedDay] = useState<string>(defaultDay);
  // The open mobile placement sheet's target (a single session or a whole
  // course's unplaced sessions), or null when closed.
  const [placeTarget, setPlaceTarget] = useState<PlacementTarget | null>(null);
  const [seenWeek, setSeenWeek] = useState<string>(weekStartISO);
  if (seenWeek !== weekStartISO) {
    setSeenWeek(weekStartISO);
    setSelectedDay(defaultDay);
  }

  const scrollRef = useRef<HTMLDivElement>(null);

  // Client-computed "now" (minutes-of-day) — only meaningful when today is shown.
  // It stays `null` through the first render (which is what the server renders
  // too, since the effect that reads the wall clock runs only after mount). The
  // now-line is gated on `nowMin != null`, so the server HTML and the first
  // client render are identical — no hydration mismatch from the client clock.
  const [nowMin, setNowMin] = useState<number | null>(null);
  useEffect(() => {
    // Minutes-of-day in the grid's tz (Europe/Berlin) via the same conversion
    // the blocks use — NOT the device clock, which draws the line an hour+ off
    // (or in yesterday's column near midnight) for a viewer outside Berlin.
    const tick = () => setNowMin(instantToDayMinutes(new Date()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll the grid to roughly "now" on load (when today is in view).
  // Berlin minutes-of-day again, so we scroll to where the now-line actually is.
  useEffect(() => {
    if (!dayISOs.includes(todayISO)) return;
    const el = scrollRef.current;
    if (!el) return;
    const min = instantToDayMinutes(new Date());
    el.scrollTop = Math.max(0, topPx(min) - el.clientHeight / 3);
  }, [dayISOs, todayISO]);

  // Run the week's auto-placement. `silent` suppresses the result toast — used by
  // the first-visit auto-run so a fresh week quietly builds itself without a popup.
  function autoArrange(silent = false) {
    startArranging(async () => {
      const fd = new FormData();
      fd.set("weekStart", weekStartISO);
      const { placed, unplaced } = await autoScheduleWeekTimes(fd);
      router.refresh();
      if (silent) return;
      if (placed === 0 && unplaced === 0) {
        toast(t("calendar.autoNone"), "info");
      } else if (unplaced > 0) {
        toast(
          t("calendar.autoResultPartial", { placed: String(placed), unplaced: String(unplaced) }),
          "info",
        );
      } else {
        toast(t("calendar.autoResult", { placed: String(placed) }), "success");
      }
    });
  }

  // ── Auto-run ONCE on first visit, only when nothing is placed yet ──────────
  // The build-itself promise: a fresh week with sessions that all still lack a
  // time quietly arranges itself the first time it's opened. Strictly guarded so
  // it never surprises the user by re-placing on later loads:
  //  • only fires when there are unplaced blocks AND zero are already timed (a
  //    truly untouched week — never after the student has placed anything);
  //  • remembered per-week in localStorage so it runs at most once per week here;
  //  • the action itself only ever touches timeless blocks, so even the single
  //    run is idempotent and can never overwrite a hand-set time.
  const anyTimed = useMemo(
    () => blocks.some((b) => b.startMin != null && b.endMin != null),
    [blocks],
  );
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (blocks.length === 0) return;
    if (anyTimed) return; // week already has placed work → never auto-run
    if (!blocks.some((b) => b.startMin == null)) return; // nothing to place
    const key = `sf:cal:autoarranged:${weekStartISO}`;
    let alreadyRan = false;
    try {
      alreadyRan = window.localStorage.getItem(key) === "1";
    } catch {
      // localStorage unavailable (private mode / disabled) → skip the auto-run
      // rather than risk re-placing on every load.
      alreadyRan = true;
    }
    if (alreadyRan) return;
    autoRanRef.current = true;
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      /* best-effort; the ref still guards against a re-run this session */
    }
    autoArrange(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStartISO, anyTimed, blocks.length]);

  // "Place the next N" — give times to a calm small batch instead of dumping the
  // whole backlog. We take the first N still-untimed sessions and lay them
  // back-to-back from a default morning start on today (or Monday), trimming any
  // that would spill past local midnight — the same write path the placement
  // sheet uses (updateBlockTime per block).
  function placeNextBatch(unplaced: CalBlock[]) {
    const batch = unplaced.slice(0, PLACE_BATCH);
    if (batch.length === 0) return;
    const day = dayISOs.includes(todayISO) ? todayISO : dayISOs[0];
    startArranging(async () => {
      try {
        let cursor = BATCH_START_MIN;
        let placed = 0;
        for (const block of batch) {
          if (cursor >= MINUTES_PER_DAY) break;
          const end = Math.min(cursor + block.minutes, MINUTES_PER_DAY);
          if (end <= cursor) break;
          const fd = new FormData();
          fd.set("blockId", block.id);
          fd.set("date", day);
          fd.set("start", dayMinutesToInstant(day, cursor).toISOString());
          fd.set("end", dayMinutesToInstant(day, end).toISOString());
          await updateBlockTime(fd);
          cursor = end;
          placed += 1;
        }
        router.refresh();
        toast(t("calendar.placedNext", { count: String(placed) }), "success");
      } catch {
        toast(t("calendar.placeNextError"), "error");
      }
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const slotStarts = useMemo(
    () => Array.from({ length: SLOT_COUNT }, (_, i) => DAY_START_MIN + i * SLOT_MIN),
    [],
  );
  const hourStarts = useMemo(() => slotStarts.filter((m) => m % 60 === 0), [slotStarts]);

  // Apply the optimistic overlays so render reflects in-flight toggles/resizes.
  const viewBlocks = useMemo(
    () =>
      blocks.map((b) => ({
        ...b,
        completed: doneOverride[b.id] ?? b.completed,
        endMin: endOverride[b.id] ?? b.endMin,
      })),
    [blocks, doneOverride, endOverride],
  );

  const activeBlock = activeId ? viewBlocks.find((b) => b.id === activeId) ?? null : null;

  async function move(block: CalBlock, dayISO: string, startMin: number | null) {
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("date", dayISO);
    if (startMin == null) return; // dropping on the unscheduled lane: no times to set
    const duration =
      block.startMin != null && block.endMin != null
        ? block.endMin - block.startMin
        : DEFAULT_DURATION;
    let endMin = startMin + duration;
    if (endMin > MINUTES_PER_DAY) endMin = MINUTES_PER_DAY;
    if (endMin <= startMin) return;

    fd.set("start", dayMinutesToInstant(dayISO, startMin).toISOString());
    fd.set("end", dayMinutesToInstant(dayISO, endMin).toISOString());
    try {
      await updateBlockTime(fd);
      router.refresh();
    } catch {
      // The card never moved optimistically (the drag overlay resets on drop
      // and the grid still renders server truth), so there's nothing to revert
      // — but a silent failure would look like the drop just didn't take.
      toast(t("calendar.blockError"), "error");
    }
  }

  // Per-block in-flight guard so a fast double-tap on the ✓ can't fire two
  // opposing toggleBlock calls that race each other (and flicker the row).
  const togglingRef = useRef<Set<string>>(new Set());

  // Tap-to-complete via the shared toggleBlock action (blockId + revalidate path).
  function toggle(block: CalBlock) {
    if (togglingRef.current.has(block.id)) return;
    togglingRef.current.add(block.id);
    const next = !(doneOverride[block.id] ?? block.completed);
    setDoneOverride((m) => ({ ...m, [block.id]: next }));
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("revalidate", "/calendar");
    void (async () => {
      try {
        await toggleBlock(fd);
        toast(next ? t("calendar.blockDone") : t("calendar.blockNotDone"), next ? "success" : "info");
        router.refresh();
      } catch {
        setDoneOverride((m) => {
          const rest = { ...m };
          delete rest[block.id];
          return rest;
        });
        toast(t("calendar.blockError"), "error");
      } finally {
        togglingRef.current.delete(block.id);
      }
    })();
  }

  // Drag-to-resize: track the active resize on a ref so the global pointer
  // handlers (added on grip pointerdown) stay stable across renders.
  const resizeRef = useRef<{
    block: CalBlock;
    startClientY: number;
    origEnd: number;
    latestEnd: number;
  } | null>(null);
  // Teardown for the window pointer listeners of the *current* resize gesture.
  // Held on a ref so an unmount mid-drag can detach them (they're normally
  // removed on pointerup, but a navigation during a resize would otherwise leak
  // the global listeners and keep this unmounted component's closures alive).
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    return () => {
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      resizeRef.current = null;
    };
  }, []);

  function beginResize(block: CalBlock, clientY: number) {
    if (block.startMin == null || block.endMin == null) return;
    // A previous gesture's listeners should never outlive a new one.
    resizeCleanupRef.current?.();
    resizeRef.current = {
      block,
      startClientY: clientY,
      origEnd: block.endMin,
      latestEnd: block.endMin,
    };

    const onMove = (e: PointerEvent) => {
      const cur = resizeRef.current;
      if (!cur) return;
      const deltaPx = e.clientY - cur.startClientY;
      const deltaMin = Math.round((deltaPx / SLOT_PX) * SLOT_MIN);
      let endMin = Math.round((cur.origEnd + deltaMin) / STEP_MIN) * STEP_MIN;
      // Clamp to a minimum length and to the day window via the calendarTime guard.
      endMin = Math.max(cur.block.startMin! + MIN_DURATION, endMin);
      const clamped = clampToDay(cur.block.startMin!, endMin);
      if (!clamped) return;
      cur.latestEnd = clamped.endMin;
      setEndOverride((m) => ({ ...m, [cur.block.id]: clamped.endMin }));
    };

    const detach = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizeCleanupRef.current = null;
    };

    const onUp = () => {
      detach();
      const cur = resizeRef.current;
      resizeRef.current = null;
      if (!cur) return;
      const endMin = cur.latestEnd;
      if (endMin === cur.origEnd) return;
      const fd = new FormData();
      fd.set("blockId", cur.block.id);
      fd.set("date", cur.block.dayISO);
      fd.set("start", dayMinutesToInstant(cur.block.dayISO, cur.block.startMin!).toISOString());
      fd.set("end", dayMinutesToInstant(cur.block.dayISO, endMin).toISOString());
      void (async () => {
        try {
          await updateBlockTime(fd);
          router.refresh();
        } catch {
          setEndOverride((m) => {
            const rest = { ...m };
            delete rest[cur.block.id];
            return rest;
          });
          toast(t("calendar.blockError"), "error");
        }
      })();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Register teardown so an unmount mid-drag (navigation) can detach these.
    resizeCleanupRef.current = detach;
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const over = e.over;
    if (!over) return;
    const data = over.data.current as DropData | undefined;
    const block = e.active.data.current?.block as CalBlock | undefined;
    if (!data || !block) return;
    if (block.dayISO === data.dayISO && block.startMin === data.startMin) return;
    if (data.startMin == null && block.startMin == null) return;
    void move(block, data.dayISO, data.startMin);
  }

  const dayIndex = dayISOs.indexOf(selectedDay);
  const examsByDay = useMemo(() => {
    const m = new Map<string, CalExam[]>();
    for (const e of exams) {
      const arr = m.get(e.dayISO) ?? [];
      arr.push(e);
      m.set(e.dayISO, arr);
    }
    return m;
  }, [exams]);

  const timedFor = (dayISO: string) =>
    viewBlocks.filter((b) => b.dayISO === dayISO && b.startMin != null && b.endMin != null);
  const lecturesFor = (dayISO: string) => lectures.filter((l) => l.dayISO === dayISO);

  // Every timeless (day-granular) block across the whole shown week — the calm
  // mobile overview groups these by course into placement summaries.
  const weekUnplaced = useMemo(
    () => viewBlocks.filter((b) => b.startMin == null),
    [viewBlocks],
  );

  // Desktop collapsed view: the week's unscheduled work grouped by course into
  // compact summaries ("OS · 9 sessions · 3h 23m"), so the lane is a short digest
  // by default instead of a long dump. "Show all" expands to the per-day lanes.
  const unplacedByCourse = useMemo(() => {
    const m = new Map<
      string,
      { courseId: string; courseName: string; count: number; minutes: number }
    >();
    for (const b of weekUnplaced) {
      const g = m.get(b.courseId) ?? {
        courseId: b.courseId,
        courseName: b.courseName,
        count: 0,
        minutes: 0,
      };
      g.count += 1;
      g.minutes += b.minutes;
      m.set(b.courseId, g);
    }
    return [...m.values()].sort((a, b) => a.courseName.localeCompare(b.courseName));
  }, [weekUnplaced]);

  return (
    <section>
      {/* Header: title + week navigation + auto-arrange. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">{t("calendar.title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?week=${prevWeekISO}`}
            aria-label={t("calendar.prevWeek")}
            className="inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/calendar"
            className="rounded-md border border-gray-200 px-2 py-1 text-xs font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {t("calendar.thisWeek")}
          </Link>
          <Link
            href={`/calendar?week=${nextWeekISO}`}
            aria-label={t("calendar.nextWeek")}
            className="inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {/* Desktop-only "Planning mode" toggle — off by default so the page
              opens on the clean structural week; on reveals the placement tools. */}
          {isDesktop && (
            <button
              type="button"
              aria-pressed={planningMode}
              onClick={() => setPlanningMode((v) => !v)}
              className={`hidden items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors md:inline-flex ${
                planningMode
                  ? "border-brand bg-brand/10 text-brand-ink"
                  : "border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
              {t("calendar.planningMode")}
            </button>
          )}
        </div>
      </div>

      {/* Mobile day switcher (below md): prev/next + a tappable Mon–Sun strip. */}
      <div className="mb-2 md:hidden">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label={t("calendar.prevDay")}
            disabled={dayIndex <= 0}
            onClick={() => dayIndex > 0 && setSelectedDay(dayISOs[dayIndex - 1])}
            className="inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="flex flex-1 justify-between gap-1">
            {dayISOs.map((dayISO, i) => {
              const isSel = dayISO === selectedDay;
              const isToday = dayISO === todayISO;
              return (
                <button
                  key={dayISO}
                  type="button"
                  onClick={() => setSelectedDay(dayISO)}
                  className={`flex flex-1 flex-col items-center rounded-md py-1 text-[11px] font-semibold ${
                    isSel
                      ? "bg-brand text-brand-foreground"
                      : isToday
                        ? "bg-brand/10 text-brand"
                        : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <span>{WEEKDAYS[i]}</span>
                  <span className="tabular-nums">{Number(dayISO.slice(8, 10))}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            aria-label={t("calendar.nextDay")}
            disabled={dayIndex >= dayISOs.length - 1}
            onClick={() => dayIndex < dayISOs.length - 1 && setSelectedDay(dayISOs[dayIndex + 1])}
            className="inline-flex items-center rounded-md border border-gray-200 px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        {/* ── Mobile: calm read-only agenda for the selected day ───────────
            Precise drag/resize is desktop-only (#9). Mobile shows the grouped
            Overview plus a read-only agenda; manual placement stays via the
            placement sheet, and "Auto-arrange my week" is the primary path. */}
        <div className="md:hidden">
          {/* Exam marker for the selected day. */}
          {examsByDay.get(selectedDay)?.map((e) => (
            <div
              key={e.courseId}
              className="mb-1 rounded-md bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
            >
              {t("calendar.examMarker", { course: e.courseName })}
            </div>
          ))}

          <MobileDayView
            weekUnplaced={weekUnplaced}
            dayTimed={timedFor(selectedDay)}
            isArranging={isArranging}
            onAutoArrange={() => autoArrange()}
            onPlace={setPlaceTarget}
          />
        </div>

        {/* ── Desktop (md+): full 7-column week ───────────────────────────── */}
        {/* Rendered only once we're on a real desktop viewport (client, post-mount)
            so the @dnd-kit droppables/columns never instantiate on mobile or SSR. */}
        {isDesktop && (
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              {/* Header row: time gutter + weekday labels. */}
              <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1">
                <div />
                {dayISOs.map((dayISO, i) => {
                  const isToday = dayISO === todayISO;
                  const dayNum = Number(dayISO.slice(8, 10));
                  return (
                    <div
                      key={dayISO}
                      className={`rounded-md px-2 py-1 text-center text-xs font-semibold ${
                        isToday
                          ? "bg-brand text-brand-foreground"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {WEEKDAYS[i]} {dayNum}
                    </div>
                  );
                })}
              </div>

              {/* Exam markers row (all-day banners under the weekday labels). */}
              {exams.length > 0 && (
                <div className="mt-1 grid grid-cols-[56px_repeat(7,1fr)] gap-1">
                  <div />
                  {dayISOs.map((dayISO) => (
                    <div key={dayISO} className="flex flex-col gap-0.5">
                      {(examsByDay.get(dayISO) ?? []).map((e) => (
                        <div
                          key={e.courseId}
                          title={t("calendar.examMarker", { course: e.courseName })}
                          className="truncate rounded bg-rose-100 px-1 py-0.5 text-[10px] font-semibold text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                        >
                          {t("calendar.examMarker", { course: e.courseName })}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Structural view (Planning mode OFF) ──────────────────────
                  The default desktop surface is the week's time STRUCTURE. The
                  PRIMARY action is one-tap "Auto-arrange my week" — the
                  build-itself promise. Manual placement (Planning mode / drag) is
                  the quiet secondary refinement, not the main path. */}
              {!planningMode && weekUnplaced.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl bg-brand/5 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">
                      {weekUnplaced.length === 1
                        ? t("calendar.sessionWaiting")
                        : t("calendar.sessionsWaiting", { count: String(weekUnplaced.length) })}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {t("calendar.autoArrangeWeekHint")}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => autoArrange()}
                    disabled={isArranging}
                  >
                    {isArranging
                      ? t("calendar.autoArrangeBuilding")
                      : t("calendar.autoArrangeWeek")}
                  </Button>
                </div>
              )}

              {/* When everything's placed: a calm confirmation + the refine hint. */}
              {!planningMode && weekUnplaced.length === 0 && blocks.length > 0 && (
                <div className="mt-1 rounded-xl bg-surface-muted px-4 py-2.5 text-[13px] text-muted-foreground">
                  {t("calendar.allArranged")}
                </div>
              )}

              {/* ── Backlog / placement tools (Planning mode ON) ─────────────
                  The full placement surface. Collapsed by default into per-course
                  summaries so the lane stays a short digest; "Show all" expands to
                  the per-day droppable lanes where drag placement lives (drag also
                  works straight onto the timed grid below). */}
              {planningMode && weekUnplaced.length > 0 && (
                <div className="mt-1 rounded-xl border border-brand/20 bg-brand/5 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t("calendar.backlog")}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => placeNextBatch(weekUnplaced)}
                        disabled={isArranging}
                      >
                        {isArranging
                          ? t("calendar.placingNext")
                          : t("calendar.placeNext", {
                              count: String(Math.min(PLACE_BATCH, weekUnplaced.length)),
                            })}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => autoArrange()}
                        disabled={isArranging}
                      >
                        {isArranging ? t("calendar.autoArranging") : t("calendar.autoArrange")}
                      </Button>
                      <button
                        type="button"
                        aria-expanded={showAllUnscheduled}
                        onClick={() => setShowAllUnscheduled((v) => !v)}
                        className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        {showAllUnscheduled
                          ? t("calendar.showLess")
                          : t("calendar.showAll")}
                      </button>
                    </div>
                  </div>

                  {showAllUnscheduled ? (
                    <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1">
                      <div />
                      {dayISOs.map((dayISO) => {
                        const lane = viewBlocks.filter(
                          (b) => b.dayISO === dayISO && b.startMin == null,
                        );
                        return (
                          <UnscheduledLane key={dayISO} dayISO={dayISO}>
                            {lane.map((b) => (
                              <BlockCard key={b.id} block={b} onToggle={toggle} />
                            ))}
                          </UnscheduledLane>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {unplacedByCourse.map((g) => (
                        <span
                          key={g.courseId}
                          title={t("calendar.dragHint")}
                          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                        >
                          <span className="font-medium">{g.courseName}</span>
                          <span className="text-gray-400 dark:text-gray-500">·</span>
                          <span className="tabular-nums text-gray-500 dark:text-gray-400">
                            {t("calendar.sessionsCount", { count: String(g.count) })}
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">·</span>
                          <span className="tabular-nums text-gray-500 dark:text-gray-400">
                            {formatDuration(t, g.minutes)}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Timed grid: hour gutter + 7 day columns. */}
              <div
                ref={scrollRef}
                className="mt-1 max-h-[70vh] overflow-y-auto"
              >
                <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1">
                  <div className="relative" style={{ height: GRID_HEIGHT }}>
                    {hourStarts.map((m) => (
                      <div
                        key={m}
                        style={{ position: "absolute", top: topPx(m) - 6, right: 4 }}
                        className="text-[10px] tabular-nums text-gray-400"
                      >
                        {minutesToHHMM(m)}
                      </div>
                    ))}
                  </div>
                  {dayISOs.map((dayISO) => (
                    <DayColumn
                      key={dayISO}
                      dayISO={dayISO}
                      isToday={dayISO === todayISO}
                      slotStarts={slotStarts}
                      dayLectures={lecturesFor(dayISO)}
                      timed={timedFor(dayISO)}
                      nowMin={nowMin}
                      onToggle={toggle}
                      onResize={beginResize}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        <DragOverlay>
          {activeBlock ? (
            <div className="rounded-md border border-brand bg-white px-1.5 py-1 text-[11px] shadow-lg dark:bg-gray-800">
              <span className="font-medium">{activeBlock.topicTitle}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {blocks.length === 0 && (
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {t("calendar.empty")}
        </p>
      )}

      {/* Calm mobile placement sheet — pick a day + start time for a session or a
          whole course's unplaced sessions (writes via updateBlockTime). */}
      <PlacementSheet
        target={placeTarget}
        dayISOs={dayISOs}
        todayISO={todayISO}
        onClose={() => setPlaceTarget(null)}
        onPlaced={() => router.refresh()}
      />
    </section>
  );
}
