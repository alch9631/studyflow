"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { updateBlockTime, autoScheduleWeekTimes } from "../courses/actions";
import {
  dayMinutesToInstant,
  minutesToHHMM,
  MINUTES_PER_DAY,
} from "@/lib/calendarTime";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Visible time window + granularity (configurable here). Rows are SLOT_MIN apart.
const DAY_START_MIN = 6 * 60; // 06:00
const DAY_END_MIN = MINUTES_PER_DAY; // 24:00
const SLOT_MIN = 30;
const SLOT_PX = 28; // height of one 30-min row
const DEFAULT_DURATION = 60; // length given to a previously-untimed block on first drop

const SLOT_COUNT = (DAY_END_MIN - DAY_START_MIN) / SLOT_MIN;

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

// A droppable target id is encoded as "day|slot" for a timed slot, or
// "day|unscheduled" for a day's unscheduled lane.
type DropData = { dayISO: string; startMin: number | null };

function topPx(startMin: number) {
  return ((startMin - DAY_START_MIN) / SLOT_MIN) * SLOT_PX;
}
function heightPx(startMin: number, endMin: number) {
  return Math.max(SLOT_PX / 2, ((endMin - startMin) / SLOT_MIN) * SLOT_PX);
}

/** A draggable block card (used both in the timed grid and the unscheduled lane). */
function BlockCard({
  block,
  positioned,
}: {
  block: CalBlock;
  positioned?: { top: number; height: number };
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    data: { block },
  });
  const isReview = block.kind === "review";
  const label =
    block.startMin != null && block.endMin != null
      ? `${minutesToHHMM(block.startMin)}–${minutesToHHMM(block.endMin)}`
      : `${block.minutes}m`;

  const style: React.CSSProperties = positioned
    ? { position: "absolute", top: positioned.top, height: positioned.height, left: 2, right: 2 }
    : {};

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      aria-label={`${block.topicTitle}, ${block.courseName}, ${label}. ${t("calendar.dragHint")}`}
      title={`${block.topicTitle} · ${block.courseName} · ${label}`}
      className={`flex flex-col overflow-hidden rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-opacity focus:outline-none focus:ring-2 focus:ring-brand ${
        isReview
          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-900/30 dark:text-emerald-100"
          : "border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
      } ${block.completed ? "opacity-50" : ""} ${isDragging ? "opacity-30" : ""}`}
      {...listeners}
      {...attributes}
    >
      <span className="truncate font-medium">{block.topicTitle}</span>
      <span className="truncate text-[10px] text-gray-500 dark:text-gray-400">
        {block.courseName}
      </span>
      <span className="mt-auto text-[10px] tabular-nums text-gray-400 dark:text-gray-500">{label}</span>
    </button>
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
        isOver
          ? "border-brand bg-brand/10"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      {children}
    </div>
  );
}

/**
 * Time-of-day week calendar (Mon–Sun). Timed blocks render absolutely-positioned
 * in their day column by start/end; day-granular ("unscheduled") blocks sit in a
 * per-day lane at the top. Dragging a block (pointer OR keyboard via @dnd-kit) to
 * a slot/lane calls {@link updateBlockTime} then refreshes.
 *
 * Props are serializable so the page stays a server component:
 *   - `dayISOs`: the 7 day dates (YYYY-MM-DD, Mon→Sun)
 *   - `todayISO`: today's date for the highlighted column
 *   - `weekStartISO`: the week's Monday (YYYY-MM-DD), passed to auto-arrange
 *   - `blocks`: the week's blocks (see {@link CalBlock})
 */
export default function WeekCalendar({
  dayISOs,
  todayISO,
  weekStartISO,
  blocks,
}: {
  dayISOs: string[];
  todayISO: string;
  weekStartISO: string;
  blocks: CalBlock[];
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [isArranging, startArranging] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  // Auto-arrange: ask the server to pack this week's timeless blocks into clock
  // times (study window + lectures + energy preference), then refresh + report.
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

  // Keyboard sensor gives the a11y win over the dashboard's native DnD: a block is
  // focusable, Space picks it up, arrows move between slots, Space drops.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const slotStarts = useMemo(
    () => Array.from({ length: SLOT_COUNT }, (_, i) => DAY_START_MIN + i * SLOT_MIN),
    [],
  );
  const hourStarts = useMemo(
    () => slotStarts.filter((m) => m % 60 === 0),
    [slotStarts],
  );

  const activeBlock = activeId ? blocks.find((b) => b.id === activeId) ?? null : null;

  async function move(block: CalBlock, dayISO: string, startMin: number | null) {
    const fd = new FormData();
    fd.set("blockId", block.id);
    fd.set("date", dayISO);
    // Dropping onto a day's Unscheduled lane has no times to set. updateBlockTime
    // only sets times (clearing them is out of scope for M3), so this is a no-op.
    if (startMin == null) return;
    // Preserve the block's existing duration; an untimed block gets a default.
    const duration =
      block.startMin != null && block.endMin != null
        ? block.endMin - block.startMin
        : DEFAULT_DURATION;
    let endMin = startMin + duration;
    // Don't let a drop near the end of the day push the block past midnight.
    if (endMin > MINUTES_PER_DAY) endMin = MINUTES_PER_DAY;
    if (endMin <= startMin) return;

    fd.set("start", dayMinutesToInstant(dayISO, startMin).toISOString());
    fd.set("end", dayMinutesToInstant(dayISO, endMin).toISOString());
    await updateBlockTime(fd);
    router.refresh();
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
    // No-op if dropped exactly where it already is.
    if (block.dayISO === data.dayISO && block.startMin === data.startMin) return;
    // Dropping a timeless block back onto an unscheduled lane is a no-op.
    if (data.startMin == null && block.startMin == null) return;
    void move(block, data.dayISO, data.startMin);
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold tracking-tight">{t("calendar.title")}</h1>
        <div className="flex items-center gap-3">
          <p className="hidden text-xs text-gray-500 sm:block dark:text-gray-400">
            {t("calendar.dragHint")}
          </p>
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

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            {/* Header row: time gutter + weekday labels */}
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

            {/* Unscheduled lanes (day-granular blocks) */}
            <div className="mt-1 grid grid-cols-[48px_repeat(7,1fr)] gap-1">
              <div className="flex items-center justify-end pr-1 text-[10px] uppercase tracking-wide text-gray-400">
                {t("calendar.unscheduled")}
              </div>
              {dayISOs.map((dayISO) => {
                const lane = blocks.filter((b) => b.dayISO === dayISO && b.startMin == null);
                return (
                  <UnscheduledLane key={dayISO} dayISO={dayISO}>
                    {lane.map((b) => (
                      <BlockCard key={b.id} block={b} />
                    ))}
                  </UnscheduledLane>
                );
              })}
            </div>

            {/* Timed grid: hour gutter + 7 day columns of stacked slots */}
            <div className="mt-1 grid grid-cols-[48px_repeat(7,1fr)] gap-1">
              {/* Time gutter */}
              <div className="relative" style={{ height: SLOT_COUNT * SLOT_PX }}>
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

              {dayISOs.map((dayISO) => {
                const timed = blocks.filter(
                  (b) => b.dayISO === dayISO && b.startMin != null && b.endMin != null,
                );
                const isToday = dayISO === todayISO;
                return (
                  <div
                    key={dayISO}
                    className={`relative rounded-md border ${
                      isToday
                        ? "border-brand/40 bg-brand/5"
                        : "border-gray-200 dark:border-gray-800"
                    }`}
                    style={{ height: SLOT_COUNT * SLOT_PX }}
                  >
                    {/* Droppable 30-min slots (the grid lines) */}
                    {slotStarts.map((m) => (
                      <TimeSlot key={m} dayISO={dayISO} startMin={m} />
                    ))}
                    {/* Absolutely-positioned timed blocks over the slots */}
                    {timed.map((b) => (
                      <BlockCard
                        key={b.id}
                        block={b}
                        positioned={{
                          top: topPx(b.startMin!),
                          height: heightPx(b.startMin!, b.endMin!),
                        }}
                      />
                    ))}
                  </div>
                );
              })}
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
