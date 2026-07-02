"use client";

import { useMemo, useState, useTransition } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { dayMinutesToInstant, minutesToHHMM, MINUTES_PER_DAY } from "@/lib/calendarTime";
import { updateBlockTime } from "../courses/actions";
import type { CalBlock } from "./WeekCalendar";

/**
 * The calm mobile placement flow — drag is weak on touch, so instead of dragging
 * a block onto a grid the student picks a day and a start time from two simple
 * pickers and the sheet writes the time via the existing {@link updateBlockTime}
 * server action.
 *
 * It opens in one of two modes:
 *  - a single session (`target.kind === "block"`), or
 *  - a whole course's worth of unplaced sessions (`target.kind === "course"`),
 *    which are laid back-to-back from the chosen start on the chosen day.
 *
 * Duration comes from each block's planned `minutes`. A block that would spill
 * past local midnight is trimmed to end at midnight (never crossing the day), and
 * bulk placement stops once the day is full, leaving the rest unplaced for another
 * day. There is no nested form here — the controls are plain selects and a button
 * that calls the action directly — to stay clear of the Radix-menu nesting gotcha.
 */

export type PlacementTarget =
  | { kind: "block"; block: CalBlock }
  | { kind: "course"; courseId: string; courseName: string; blocks: CalBlock[] };

// Start-time options, every 30 min across the visible day window (06:00–22:00),
// which keeps the picker short and the choices realistic for study sessions.
const PICK_START_MIN = 6 * 60; // 06:00
const PICK_END_MIN = 22 * 60; // 22:00
const PICK_STEP = 30;

export default function PlacementSheet({
  target,
  dayISOs,
  todayISO,
  onClose,
  onPlaced,
}: {
  target: PlacementTarget | null;
  dayISOs: string[];
  todayISO: string;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [isPlacing, startPlacing] = useTransition();

  // Default the day to today (if in this week) else Monday, and the start time to
  // a sensible mid-morning slot — both editable before placing.
  const defaultDay = dayISOs.includes(todayISO) ? todayISO : dayISOs[0];
  const [day, setDay] = useState<string>(defaultDay);
  const [startMin, setStartMin] = useState<number>(9 * 60);

  // Reset the pickers whenever a new target opens, using the prop-change pattern.
  const [seenTarget, setSeenTarget] = useState<PlacementTarget | null>(target);
  if (seenTarget !== target) {
    setSeenTarget(target);
    if (target) {
      setDay(defaultDay);
      setStartMin(9 * 60);
    }
  }

  const startOptions = useMemo(
    () =>
      Array.from(
        { length: (PICK_END_MIN - PICK_START_MIN) / PICK_STEP + 1 },
        (_, i) => PICK_START_MIN + i * PICK_STEP,
      ),
    [],
  );

  const WEEKDAYS = [
    t("calendar.mon"),
    t("calendar.tue"),
    t("calendar.wed"),
    t("calendar.thu"),
    t("calendar.fri"),
    t("calendar.sat"),
    t("calendar.sun"),
  ];

  const sessions = useMemo<CalBlock[]>(() => {
    if (!target) return [];
    return target.kind === "block" ? [target.block] : target.blocks;
  }, [target]);

  const title =
    target?.kind === "course"
      ? t("calendar.placeCourseTitle", { course: target.courseName })
      : target?.kind === "block"
        ? t("calendar.placeSessionTitle", { topic: target.block.topicTitle })
        : "";

  const description =
    target?.kind === "course"
      ? t("calendar.placeCourseDesc", { count: String(target.blocks.length) })
      : t("calendar.placeSessionDesc");

  async function place() {
    if (sessions.length === 0) return;
    startPlacing(async () => {
      try {
        // Lay sessions back-to-back from the chosen start; stop when the day is
        // full. Count only writes the server actually ACCEPTED as placed — the
        // action reports per-block outcomes (rate limit, exam day, invalid
        // times) and pretending those landed would quietly lose sessions.
        let cursor = startMin;
        let placed = 0;
        let failed = 0;
        let limited = false;
        for (const block of sessions) {
          const duration = block.minutes;
          if (cursor >= MINUTES_PER_DAY) break;
          const end = Math.min(cursor + duration, MINUTES_PER_DAY);
          if (end <= cursor) break;
          const startInstant = dayMinutesToInstant(day, cursor);
          const endInstant = dayMinutesToInstant(day, end);
          // DST-gap guard: the spring-forward hour can collapse two different
          // wall-clock minutes to the same instant → a zero-length pair the
          // server would reject. Skip it and report honestly below.
          if (endInstant.getTime() <= startInstant.getTime()) {
            failed += 1;
            continue;
          }
          const fd = new FormData();
          fd.set("blockId", block.id);
          fd.set("date", day);
          fd.set("start", startInstant.toISOString());
          fd.set("end", endInstant.toISOString());
          const outcome = await updateBlockTime(fd);
          if (outcome.ok) {
            cursor = end;
            placed += 1;
          } else if (outcome.reason === "rate-limited") {
            limited = true;
            break;
          } else {
            failed += 1; // the slot stays free for the next session
          }
        }
        if (limited) {
          toast(t("calendar.rateLimited"), "error");
        } else if (failed > 0 && placed > 0) {
          toast(
            t("calendar.placedPartial", { placed: String(placed), failed: String(failed) }),
            "info",
          );
        } else if (failed > 0) {
          toast(t("calendar.placeNextError"), "error");
        }
        onPlaced();
        onClose();
      } catch {
        // A mid-loop write failure must not silently strand the sheet open with no
        // feedback (some blocks may already be placed) — surface it and close.
        toast(t("calendar.placeNextError"), "error");
        onPlaced();
        onClose();
      }
    });
  }

  return (
    <Dialog open={target != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t("calendar.placeDayLabel")}
            </span>
            <Select value={day} onChange={(e) => setDay(e.target.value)}>
              {dayISOs.map((iso, i) => (
                <option key={iso} value={iso}>
                  {WEEKDAYS[i]} {Number(iso.slice(8, 10))}
                  {iso === todayISO ? ` · ${t("calendar.today")}` : ""}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t("calendar.placeStartLabel")}
            </span>
            <Select
              value={String(startMin)}
              onChange={(e) => setStartMin(Number(e.target.value))}
            >
              {startOptions.map((m) => (
                <option key={m} value={m}>
                  {minutesToHHMM(m)}
                </option>
              ))}
            </Select>
          </label>

          {sessions.length > 1 && (
            <p className="text-[12px] text-gray-500 dark:text-gray-400">
              {t("calendar.placeBackToBack", { count: String(sessions.length) })}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t("calendar.placeCancel")}
          </Button>
          <Button type="button" variant="primary" size="md" onClick={place} disabled={isPlacing}>
            {isPlacing ? t("calendar.placing") : t("calendar.placeConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
