"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { haptics } from "./haptics";

/**
 * One horizontal-swipe action on a list row. `tone` picks the colour of the
 * panel revealed behind the row as it slides; `onTrigger` runs once the swipe
 * passes the commit threshold (e.g. mark a study block done, delete a course).
 */
export type SwipeAction = {
  label: string;
  /** A small emoji/glyph shown beside the label (decorative). */
  icon: string;
  tone: "success" | "danger" | "neutral";
  onTrigger: () => void;
};

/**
 * A touch-swipeable row. Drag the content left or right to reveal a coloured
 * action panel; release past the threshold to commit. Purely additive — the
 * buttons/links inside the row keep working, and on devices without touch (or
 * with no actions supplied) it renders as a plain wrapper.
 *
 * Implementation notes:
 *   - Pointer Events (touch + pen + mouse) drive it, but a swipe only *engages*
 *     after a clearly-horizontal move past a small slop, so taps and vertical
 *     scrolling are never hijacked (`touch-action: pan-y` keeps native scroll).
 *   - A committed swipe suppresses the synthetic click that follows, so the
 *     gesture never also toggles a checkbox or follows a card link underneath.
 *   - The content sits opaque above the panels (give it a solid background via
 *     `contentClassName`); at rest the panels are fully hidden.
 *   - `prefers-reduced-motion` drops the snap-back transition (instant).
 */

const TONE: Record<SwipeAction["tone"], string> = {
  success: "bg-green-500 text-white",
  danger: "bg-red-600 text-white",
  neutral: "bg-gray-500 text-white dark:bg-gray-600",
};

const THRESHOLD = 72; // px the row must travel to commit the action
const MAX = 104; // px the row can travel (resistance applies past THRESHOLD)
const SLOP = 10; // px before a drag is treated as a horizontal swipe

export default function SwipeRow({
  left,
  right,
  children,
  className,
  contentClassName,
}: {
  /** Action revealed when swiping LEFT (panel on the right edge). */
  left?: SwipeAction;
  /** Action revealed when swiping RIGHT (panel on the left edge). */
  right?: SwipeAction;
  children: ReactNode;
  /** Classes for the outer (clipping) container — e.g. matching radius. */
  className?: string;
  /** Classes for the moving content — MUST include an opaque background. */
  contentClassName?: string;
}) {
  const reduce = useReducedMotion();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const engaged = useRef(false);
  const dxRef = useRef(0);
  const suppressClick = useRef(false);

  const enabled = Boolean(left || right);

  function reset() {
    start.current = null;
    engaged.current = false;
    dxRef.current = 0;
    setDragging(false);
    setDx(0);
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (!enabled) return;
    // Touch / pen only — desktop keeps its buttons; a mouse drag never toggles.
    if (e.pointerType === "mouse") return;
    suppressClick.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    engaged.current = false;
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!start.current) return;
    const ddx = e.clientX - start.current.x;
    const ddy = e.clientY - start.current.y;

    if (!engaged.current) {
      // Vertical-dominant move → it's a scroll, bail and let the page handle it.
      if (Math.abs(ddy) > SLOP && Math.abs(ddy) >= Math.abs(ddx)) {
        start.current = null;
        return;
      }
      // Not yet clearly horizontal → wait.
      if (Math.abs(ddx) < SLOP || Math.abs(ddx) <= Math.abs(ddy)) return;
      engaged.current = true;
      setDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — keep going */
      }
    }

    // Clamp toward the side that actually has an action; resist past threshold.
    let next = ddx;
    if (next > 0 && !right) next = 0;
    if (next < 0 && !left) next = 0;
    const sign = Math.sign(next);
    const mag = Math.abs(next);
    const eased =
      mag > THRESHOLD ? Math.min(THRESHOLD + (mag - THRESHOLD) * 0.4, MAX) : mag;
    dxRef.current = sign * eased;
    setDx(sign * eased);
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (!engaged.current) {
      reset();
      return;
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const committed = Math.abs(dxRef.current) >= THRESHOLD;
    const action = dxRef.current > 0 ? right : left;
    if (committed && action) {
      // The gesture replaced the tap — don't let the trailing click fire too.
      suppressClick.current = true;
      if (action.tone === "danger") haptics.warn();
      else haptics.commit();
      action.onTrigger();
    }
    reset();
  }

  if (!enabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`}>
      {/* Revealed when swiping RIGHT (content slides right, panel on the left). */}
      {right && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 left-0 flex items-center gap-1.5 px-4 text-sm font-semibold ${TONE[right.tone]}`}
          style={{ width: MAX, opacity: dx > 0 ? 1 : 0 }}
        >
          <span>{right.icon}</span>
          <span>{right.label}</span>
        </div>
      )}
      {/* Revealed when swiping LEFT (content slides left, panel on the right). */}
      {left && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end gap-1.5 px-4 text-sm font-semibold ${TONE[left.tone]}`}
          style={{ width: MAX, opacity: dx < 0 ? 1 : 0 }}
        >
          <span>{left.icon}</span>
          <span>{left.label}</span>
        </div>
      )}

      <div
        className={`relative ${contentClassName ?? ""}`}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging || reduce ? "none" : "transform 200ms ease-out",
          touchAction: "pan-y",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        {children}
      </div>
    </div>
  );
}
