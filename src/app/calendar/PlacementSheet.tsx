"use client";

import { useMemo, useState, useTransition } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
 * Existing sessions keep their duration; new placements use planned `minutes`.
 * Bulk placement stops at midnight, leaving any remaining sessions unplaced.
 */

export type PlacementTarget =
  | { kind: "block"; block: CalBlock }
  | { kind: "course"; courseId: string; courseName: string; blocks: CalBlock[] };

export default function PlacementSheet({
  target,
  dayISOs,
  todayISO,
  selectedDayISO,
  onClose,
  onPlaced,
}: {
  target: PlacementTarget | null;
  dayISOs: string[];
  todayISO: string;
  selectedDayISO: string;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const t = useT();
  const { toast } = useToast();
  const [isPlacing, startPlacing] = useTransition();

  // New placements follow the day the student is viewing. Existing sessions
  // retain their own day and exact time, including auto-arranged minute offsets.
  const defaultDay = selectedDayISO;
  const [day, setDay] = useState<string>(defaultDay);
  const [startTime, setStartTime] = useState("09:00");

  // Reset the pickers whenever a new target opens, using the prop-change pattern.
  const [seenTarget, setSeenTarget] = useState<PlacementTarget | null>(target);
  if (seenTarget !== target) {
    setSeenTarget(target);
    if (target) {
      const block = target.kind === "block" ? target.block : null;
      setDay(block?.dayISO ?? defaultDay);
      setStartTime(minutesToHHMM(block?.startMin ?? 9 * 60));
    }
  }

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

  const editing = target?.kind === "block" && target.block.startMin != null;
  const title = editing
    ? t("calendar.editSessionTitle")
    : target?.kind === "course"
      ? t("calendar.placeCourseTitle", { course: target.courseName })
      : target?.kind === "block"
        ? t("calendar.placeSessionTitle", { topic: target.block.topicTitle })
        : "";

  const description =
    target?.kind === "course"
      ? t("calendar.placeCourseDesc", { count: String(target.blocks.length) })
      : t("calendar.placeSessionDesc");

  const latestStart = editing && target?.kind === "block" && target.block.endMin != null
    ? minutesToHHMM(MINUTES_PER_DAY - (target.block.endMin - target.block.startMin!))
    : undefined;

  async function place() {
    if (sessions.length === 0 || isPlacing) return;
    startPlacing(async () => {
      let placed = 0;
      try {
        // Lay sessions back-to-back from the chosen start; stop when the day is
        // full. Count only writes the server actually ACCEPTED as placed — the
        // action reports per-block outcomes (rate limit, exam day, invalid
        // times) and pretending those landed would quietly lose sessions.
        const [hours, minutes] = startTime.split(":").map(Number);
        let cursor = hours * 60 + minutes;
        let failed = 0;
        let limited = false;
        for (const block of sessions) {
          const duration = block.startMin != null && block.endMin != null
            ? block.endMin - block.startMin
            : block.minutes;
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
        // Keep failed edits open so the student can choose another slot.
        if (placed === 0) return;
        onPlaced();
        onClose();
      } catch {
        toast(t("calendar.placeNextError"), "error");
        // Refresh partial batches, but preserve an unsaved edit for retry.
        if (placed > 0) {
          onPlaced();
          onClose();
        }
      }
    });
  }

  return (
    <Dialog open={target != null} onOpenChange={(o) => !o && !isPlacing && onClose()}>
      <DialogContent mobileSheet>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
        {editing && target?.kind === "block" && (
          <p className="mt-3 break-words text-sm font-medium">{target.block.topicTitle} · {target.block.courseName}</p>
        )}

        <form onSubmit={(event) => { event.preventDefault(); void place(); }}>
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
              <Input type="time" required step={60} max={latestStart} value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full" />
            </label>

            {sessions.length > 1 && (
              <p className="text-[12px] text-gray-500 dark:text-gray-400">
                {t("calendar.placeBackToBack", { count: String(sessions.length) })}
              </p>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={isPlacing}>
              {t("calendar.placeCancel")}
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={isPlacing}>
              {isPlacing ? t("calendar.placing") : t(editing ? "calendar.saveTime" : "calendar.placeConfirm")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
