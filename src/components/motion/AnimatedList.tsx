"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Subtle enter/exit polish for the app's item lists (today's study blocks,
 * a course's topics & deadlines, …). The list stays a plain semantic `<ul>`;
 * {@link AnimatedListItem} children are `motion.li`s wrapped in
 * {@link AnimatePresence}, so items fade+rise in on mount and fade+collapse out
 * when a server action revalidates them away.
 *
 * Server-rendered children pass straight through — these are presentation-only
 * wrappers, so the `<li>` content (toggle forms, links) is unchanged.
 *
 * `prefers-reduced-motion` is honoured per item via Framer's `useReducedMotion`
 * (see {@link AnimatedListItem}): motion collapses to an instant opacity swap.
 */

export function AnimatedList({
  children,
  className,
  "aria-live": ariaLive,
}: {
  children: ReactNode;
  className?: string;
  "aria-live"?: "polite" | "assertive" | "off";
}) {
  return (
    <ul className={className} aria-live={ariaLive}>
      {/* initial={false} skips the entrance on the very first paint so a fresh
          page load doesn't flash every row in — items animate only as they
          enter/leave after that. */}
      <AnimatePresence initial={false}>{children}</AnimatePresence>
    </ul>
  );
}

export function AnimatedListItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.li
      layout={!reduce}
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.li>
  );
}
