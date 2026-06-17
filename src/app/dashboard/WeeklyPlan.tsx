"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { rescheduleBlock } from "../courses/actions";
import styles from "./dashboard.module.css";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type WeekBlock = {
  id: string;
  dateISO: string; // YYYY-MM-DD (the day the block sits on)
  topicTitle: string;
  minutes: number;
  kind: string;
  courseId: string;
  courseName: string;
  ai: boolean;
  completed: boolean;
};

/**
 * Interactive weekly plan grid for the desktop dashboard.
 *
 * Server-fetched, serialized blocks are rendered into a Mon–Sun grid. Each block
 * is a native HTML5 drag source; dropping it on another day column posts to the
 * {@link rescheduleBlock} server action and refreshes. A plain click (drag never
 * fired) navigates to the block's course.
 *
 * Props are intentionally serializable so page.tsx stays a server component:
 *   - `dayISOs`: the 7 day dates (YYYY-MM-DD, Mon→Sun)
 *   - `todayISO`: today's date (YYYY-MM-DD) for the highlighted column
 *   - `blocks`: the week's blocks (see {@link WeekBlock})
 */
export default function WeeklyPlan({
  dayISOs,
  todayISO,
  blocks,
}: {
  dayISOs: string[];
  todayISO: string;
  blocks: WeekBlock[];
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  // Tracks whether a drag actually started, so a click that follows a drag
  // doesn't also navigate to the course.
  const draggedRef = useRef(false);

  async function move(blockId: string, dateISO: string) {
    const fd = new FormData();
    fd.set("blockId", blockId);
    fd.set("date", dateISO);
    await rescheduleBlock(fd);
    router.refresh();
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white">This week</h2>
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> AI-generated block
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {dayISOs.map((dayISO, i) => {
          const dayBlocks = blocks.filter((b) => b.dateISO === dayISO);
          const isToday = dayISO === todayISO;
          const isOver = overDay === dayISO;
          const dayNum = Number(dayISO.slice(8, 10));
          return (
            <div
              key={dayISO}
              onDragOver={(e) => {
                e.preventDefault();
                if (overDay !== dayISO) setOverDay(dayISO);
              }}
              onDragLeave={() => setOverDay((d) => (d === dayISO ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setOverDay(null);
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setDragId(null);
                if (!id) return;
                // Dropped back on the day it already sits on → no-op (skip the
                // pointless write + refresh flash).
                const dragged = blocks.find((b) => b.id === id);
                if (dragged && dragged.dateISO === dayISO) return;
                void move(id, dayISO);
              }}
              className={`flex flex-col gap-2 rounded-lg transition-colors ${
                isOver ? "bg-indigo-500/10 ring-1 ring-indigo-500/40" : ""
              }`}
            >
              <div
                className={`rounded-md px-2 py-1 text-center text-xs font-semibold ${
                  isToday ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400"
                }`}
              >
                {WEEKDAYS[i]} {dayNum}
              </div>
              {dayBlocks.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-800 px-2 py-3 text-center text-[10px] text-slate-600">
                  —
                </div>
              )}
              {dayBlocks.map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={(e) => {
                    draggedRef.current = true;
                    setDragId(b.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", b.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverDay(null);
                    // Reset on the next tick so the trailing click is suppressed.
                    setTimeout(() => {
                      draggedRef.current = false;
                    }, 0);
                  }}
                  onClick={() => {
                    if (draggedRef.current) return;
                    router.push(`/courses/${b.courseId}`);
                  }}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/courses/${b.courseId}`);
                    }
                  }}
                  title={`${b.topicTitle} · ${b.courseName}`}
                  className={`cursor-pointer rounded-lg bg-slate-900 px-2 py-2 transition-opacity hover:ring-1 hover:ring-indigo-500/40 ${
                    b.ai ? styles.aiBlock : "border border-slate-800"
                  } ${b.completed ? "opacity-50" : ""} ${dragId === b.id ? "opacity-30" : ""}`}
                >
                  <p className="line-clamp-2 text-xs font-medium text-slate-100">{b.topicTitle}</p>
                  <p className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                    <span className="truncate">{b.courseName}</span>
                    <span className={`ml-1 shrink-0 ${b.ai ? "text-emerald-400" : "text-indigo-400"}`}>
                      {b.minutes}m
                    </span>
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
