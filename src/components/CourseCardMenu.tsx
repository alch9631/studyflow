"use client";

import { type MouseEvent } from "react";
import Link from "next/link";
import { deleteCourse, healCourse } from "@/app/courses/actions";
import { iconButtonClass } from "./ui";
import ConfirmDialog from "./ConfirmDialog";
import ToastForm from "./ToastForm";
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
 * of that Link (positioned absolute, top-right) — never nested inside the anchor,
 * which would be invalid HTML and would hijack the card tap. The trigger calls
 * `stopPropagation`/`preventDefault` so opening the menu can never navigate the
 * card, and Radix portals the menu content to the document root.
 *
 * Server actions follow the codebase pattern: plain `<form action={...}>` with a
 * hidden `courseId`, so they work without JS-only click handlers. Delete is gated
 * behind the shared {@link ConfirmDialog}.
 */
export default function CourseCardMenu({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  // The trigger sits on top of the card's <Link>. Stop the click/keys from
  // bubbling to the anchor so opening the menu never navigates to the detail page.
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

        {/* Rebuild the study plan (redistribute remaining work over days left).
            The submit <button> is the menu item; its enclosing form carries the
            server action + hidden courseId, matching the codebase pattern. */}
        <ToastForm
          action={healCourse}
          errorMessage="Couldn't rebuild the plan — please try again."
        >
          <input type="hidden" name="courseId" value={courseId} />
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <span aria-hidden="true">🔁</span>
              Rebuild plan
            </button>
          </DropdownMenuItem>
        </ToastForm>

        <DropdownMenuItem asChild>
          <a href="/api/export?format=json">
            <span aria-hidden="true">⬇️</span>
            Export
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Destructive: gated behind the shared confirm dialog. `onSelect`
            preventDefault keeps the dialog open after Radix closes the menu. */}
        <DropdownMenuItem
          onSelect={(e) => e.preventDefault()}
          className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
        >
          <ConfirmDialog
            action={deleteCourse}
            fields={{ courseId }}
            triggerLabel={
              <>
                <span aria-hidden="true">🗑</span>
                Delete course
              </>
            }
            triggerClassName="flex w-full items-center gap-2 text-left"
            title="Delete this course?"
            message={
              <>
                This permanently removes <strong>{courseName}</strong> — its
                topics, deadlines, and study plan. This can&apos;t be undone.
              </>
            }
            confirmLabel="Delete course"
            pendingLabel="Deleting…"
            errorMessage="Couldn't delete the course — please try again."
          />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
