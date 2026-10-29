"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { haptics } from "./haptics";

/**
 * One horizontal-swipe action on a list row. `tone` picks the colour of the
 * panel revealed behind the row as it slides; `onTrigger` runs once the swipe
 * passes the commit threshold (e.g. mark a study block done, delete a course).
 */
export type SwipeAction = {
  label: string;
  /** A small icon shown beside the label (decorative; the panel is aria-hidden). */
  icon: ReactNode;
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
  success: "bg-green-700 text-white",
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
  disabled = false,
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
  disabled?: boolean;
}) {
  const reduce = useReducedMotion();
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; pointerId: number; node: Element } | null>(null);
  const engaged = useRef(false);
  const dxRef = useRef(0);
  const suppressClick = useRef(false);

  const enabled = !disabled && Boolean(left || right);

  const reset = useCallback(() => {
    const active = start.current;
    if (engaged.current) suppressClick.current = true;
    start.current = null;
    engaged.current = false;
    dxRef.current = 0;
    setDragging(false);
    setDx(0);
    try {
      if (active?.node.hasPointerCapture(active.pointerId)) active.node.releasePointerCapture(active.pointerId);
    } catch { /* Already released by the browser. */ }
  }, []);

  useEffect(() => {
    const end = (event: PointerEvent) => { if (event.pointerId === start.current?.pointerId) reset(); };
    window.addEventListener("blur", reset);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("blur", reset);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [reset]);

  function onPointerDown(e: ReactPointerEvent) {
    if (!enabled || start.current || !e.isPrimary) return;
    const target = e.target as HTMLElement | null;
    // React portal events bubble through the row, but editors live outside it.
    if (!target || !e.currentTarget.contains(target)) return;
    // A fresh press must work after a swipe, including mouse and text inputs.
    suppressClick.current = false;
    // Touch / pen only — desktop keeps its buttons; a mouse drag never toggles.
    if (e.pointerType === "mouse") return;
    // Never hijack a drag that starts in a text-entry control — a horizontal
    // drag there is the user selecting/scrubbing text (e.g. the grade field on
    // the Passed page), not a swipe. Buttons and links stay swipeable: the
    // whole card being a link is the normal case, and plain taps never engage
    // the gesture anyway (the SLOP guard below).
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    start.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId, node: e.currentTarget };
    engaged.current = false;
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!start.current || e.pointerId !== start.current.pointerId) return;
    if (!enabled) { reset(); return; }
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
    if (e.pointerId !== start.current?.pointerId) return;
    if (!enabled) { reset(); return; }
    if (!engaged.current) {
      reset();
      return;
    }
    const committed = Math.abs(dxRef.current) >= THRESHOLD;
    const action = dxRef.current > 0 ? right : left;
    reset();
    if (committed && action) {
      // The gesture replaced the tap — don't let the trailing click fire too.
      suppressClick.current = true;
      if (action.tone === "danger") haptics.warn();
      else haptics.commit();
      action.onTrigger();
    }
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
          touchAction: enabled ? "pan-y pinch-zoom" : "auto",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => { if (event.pointerId === start.current?.pointerId) reset(); }}
        onLostPointerCapture={(event) => {
          // Implicit touch capture transfers from a child to this row; only
          // losing the row's own capture cancels its gesture.
          if (event.target === event.currentTarget && event.pointerId === start.current?.pointerId) reset();
        }}
        onClickCapture={(e) => {
          if (e.currentTarget.contains(e.target as Node) && suppressClick.current && e.detail !== 0) {
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
