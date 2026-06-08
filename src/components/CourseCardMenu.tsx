"use client";

import { type MouseEvent } from "react";
import Link from "next/link";
import { iconButtonClass } from "./ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/**
 * The per-card "Course settings" menu on the My Courses list.
 *
 * Design constraint: each course card is a single `<Link>` to the detail page so
 * the whole row is one tap target. This menu is rendered as an *overlay sibling*
 * of that Link (positioned absolute, top-right) — never nested inside the anchor.
 * The trigger stops propagation so opening the menu never navigates the card.
 *
 * IMPORTANT: every item here is a plain navigation `<Link>`/`<a>`. We deliberately
 * do NOT nest `<form>`s, confirm dialogs, or motion components inside the portaled
 * Radix menu — that nesting crashed the page in production (the menu mounts a
 * framer-motion Dialog + nested forms inside a portaled menuitem, which throws on
 * client render and trips the route error boundary). The destructive/action items
 * (rebuild plan, delete) deep-link to the course detail page, where those flows are
 * already implemented with their own confirm dialog and server actions.
 */
export default function CourseCardMenu({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  // The trigger sits on top of the card's <Link>; stop the click from bubbling to
  // the anchor so opening the menu never navigates to the detail page.
  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={stop}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`Course settings for ${courseName}`}
        className={iconButtonClass(
          "inline-flex bg-white/80 text-gray-600 shadow-sm backdrop-blur hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-brand dark:bg-gray-900/80 dark:text-gray-300 dark:hover:bg-gray-800",
        )}
      >
        <span aria-hidden="true">⋯</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="truncate">{courseName}</DropdownMenuLabel>

        <DropdownMenuItem asChild>
          <Link href={`/courses/${courseId}`}>
            <span aria-hidden="true">📈</span>
            Update progress / open
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={`/courses/${courseId}#settings`}>
            <span aria-hidden="true">⚙️</span>
            Edit settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href={`/courses/${courseId}#settings`}>
            <span aria-hidden="true">🔁</span>
            Rebuild plan
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <a href="/api/export?format=json">
            <span aria-hidden="true">⬇️</span>
            Export
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          asChild
          className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
        >
          <Link href={`/courses/${courseId}#settings`}>
            <span aria-hidden="true">🗑</span>
            Delete course
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
