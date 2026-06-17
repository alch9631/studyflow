"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  minutesToHHMM,
  clampToDay,
  MINUTES_PER_DAY,
} from "@/lib/calendarTime";
import { layoutDayBlocks } from "@/lib/calendarLayout";
import MobileDayView from "./MobileDayView";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Visible time window + granularity (configurable here). Rows are SLOT_MIN apart.
const DAY_START_MIN = 6 * 60; // 06:00
const DAY_END_MIN = MINUTES_PER_DAY; // 24:00
const SLOT_MIN = 30;
const SLOT_PX = 28; // height of one 30-min row
const STEP_MIN = 15; // resize granularity
const MIN_DURATION = 15; // smallest block a resize can produce
const DEFAULT_DURATION = 60; // length given to a previously-untimed block on first drop

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
          className={`absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded border text-[9px] leading-none ${
            block.completed
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 bg-white/80 text-transparent hover:text-gray-400 dark:border-gray-600 dark:bg-gray-900/70"
          }`}
        >
          ✓
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

  // Optimistic completed-state overlay so the ✓ toggle feels instant.
  const [doneOverride, setDoneOverride] = useState<Record<string, boolean>>({});
  // Optimistic duration overlay (block id → end minutes) while/after a resize.
  const [endOverride, setEndOverride] = useState<Record<string, number>>({});

  // Mobile selected day: default to today if it's in the shown week, else Monday.
  // When the week changes (new weekStart), reset the selection during render —
  // the "adjust state when a prop changes" pattern, so no setState-in-effect.
  const defaultDay = dayISOs.includes(todayISO) ? todayISO : dayISOs[0];
  const [selectedDay, setSelectedDay] = useState<string>(defaultDay);
  // Mobile view mode: a grouped, compressed "Overview" (default — less
  // overwhelming) or the full drag-and-drop "Timeline" grid.
  const [mobileView, setMobileView] = useState<"overview" | "timeline">("overview");
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
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll the grid to roughly "now" on load (when today is in view).
  useEffect(() => {
    if (!dayISOs.includes(todayISO)) return;
    const el = scrollRef.current;
    if (!el) return;
    const d = new Date();
    const min = d.getHours() * 60 + d.getMinutes();
    el.scrollTop = Math.max(0, topPx(min) - el.clientHeight / 3);
  }, [dayISOs, todayISO]);

  function autoArrange() {
    startArranging(async () => {
      const fd = new FormData();
      fd.set("weekStart", weekStartISO);
      const { placed, unplaced } = await autoScheduleWeekTimes(fd);
      router.refresh();
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
    await updateBlockTime(fd);
    router.refresh();
  }

  // Tap-to-complete via the shared toggleBlock action (blockId + revalidate path).
  function toggle(block: CalBlock) {
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

  function beginResize(block: CalBlock, clientY: number) {
    if (block.startMin == null || block.endMin == null) return;
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

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
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

  return (
    <section>
      {/* Header: title + week navigation + auto-arrange. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">{t("calendar.title")}</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/calendar?week=${prevWeekISO}`}
            aria-label={t("calendar.prevWeek")}
            className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ‹
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
            className="rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            ›
          </Link>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={autoArrange}
            disabled={isArranging}
          >
            {isArranging ? t("calendar.autoArranging") : t("calendar.autoArrange")}
          </Button>
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
            className="rounded-md border border-gray-200 px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
          >
            ‹
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
            className="rounded-md border border-gray-200 px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-700"
          >
            ›
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
        {/* ── Mobile: single selected-day view (Overview or Timeline) ─────── */}
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

          {/* Overview ⇆ Timeline toggle. Overview is the calm grouped default;
              Timeline is the full drag-and-drop grid for precise placement. */}
          <div className="mb-2 inline-flex rounded-md border border-gray-200 p-0.5 text-[11px] font-medium dark:border-gray-700">
            <button
              type="button"
              aria-pressed={mobileView === "overview"}
              onClick={() => setMobileView("overview")}
              className={`rounded px-2.5 py-1 ${
                mobileView === "overview"
                  ? "bg-brand text-brand-foreground"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {t("calendar.viewOverview")}
            </button>
            <button
              type="button"
              aria-pressed={mobileView === "timeline"}
              onClick={() => setMobileView("timeline")}
              className={`rounded px-2.5 py-1 ${
                mobileView === "timeline"
                  ? "bg-brand text-brand-foreground"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {t("calendar.viewTimeline")}
            </button>
          </div>

          {mobileView === "overview" ? (
            <MobileDayView
              dayISO={selectedDay}
              timed={timedFor(selectedDay)}
              unscheduled={viewBlocks.filter(
                (b) => b.dayISO === selectedDay && b.startMin == null,
              )}
              onToggle={toggle}
            />
          ) : (
            <>
              {/* Unscheduled lane for the selected day. */}
              <div className="mb-1">
                <UnscheduledLane dayISO={selectedDay}>
                  {viewBlocks
                    .filter((b) => b.dayISO === selectedDay && b.startMin == null)
                    .map((b) => (
                      <BlockCard key={b.id} block={b} onToggle={toggle} />
                    ))}
                </UnscheduledLane>
              </div>
              <div className="grid grid-cols-[48px_1fr] gap-1">
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
                <DayColumn
                  dayISO={selectedDay}
                  isToday={selectedDay === todayISO}
                  slotStarts={slotStarts}
                  dayLectures={lecturesFor(selectedDay)}
                  timed={timedFor(selectedDay)}
                  nowMin={nowMin}
                  onToggle={toggle}
                  onResize={beginResize}
                />
              </div>
            </>
          )}
        </div>

        {/* ── Desktop (md+): full 7-column week ───────────────────────────── */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[680px]">
              {/* Header row: time gutter + weekday labels. */}
              <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-1">
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
                <div className="mt-1 grid grid-cols-[48px_repeat(7,1fr)] gap-1">
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

              {/* Unscheduled lanes (day-granular blocks). */}
              <div className="mt-1 grid grid-cols-[48px_repeat(7,1fr)] gap-1">
                <div className="flex items-center justify-end pr-1 text-[10px] uppercase tracking-wide text-gray-400">
                  {t("calendar.unscheduled")}
                </div>
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

              {/* Timed grid: hour gutter + 7 day columns. */}
              <div
                ref={scrollRef}
                className="mt-1 max-h-[70vh] overflow-y-auto"
              >
                <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-1">
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
    </section>
  );
}
