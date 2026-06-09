"use client";

import { useState, type MouseEvent } from "react";
import { deleteCourse } from "@/app/courses/actions";
import { iconButtonClass } from "./ui";
import { Button } from "./ui/button";
import SubmitButton from "./SubmitButton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
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
 * Rendered as an overlay sibling of the card's `<Link>` (positioned absolute,
 * top-right) — never nested inside the anchor. The trigger stops propagation so
 * opening the menu never navigates the card.
 *
 * The confirm Dialog lives OUTSIDE the dropdown (a sibling, controlled by state)
 * — not nested inside a menu item — so there's no fragile menu↔dialog nesting.
 * The "Delete course" item just flips `confirmOpen`; the actual delete is a plain
 * `<form action={deleteCourse}>` (the action redirects to /courses on success).
 */
export default function CourseCardMenu({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const stop = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <>
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
            <a href="/api/export?format=json">
              <span aria-hidden="true">⬇️</span>
              Export
            </a>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={(e) => {
              // Keep the menu from closing/refocusing before the dialog mounts.
              e.preventDefault();
              setConfirmOpen(true);
            }}
            className="text-red-600 focus:bg-red-50 focus:text-red-700 dark:text-red-400 dark:focus:bg-red-950/40 dark:focus:text-red-300"
          >
            <span aria-hidden="true">🗑</span>
            Delete course
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>Delete this course?</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{courseName}</strong> — its topics,
            deadlines, and study plan. This can&apos;t be undone.
          </DialogDescription>
          <form action={deleteCourse} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="courseId" value={courseId} />
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <SubmitButton variant="danger-solid" pendingLabel="Deleting…">
              Delete course
            </SubmitButton>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
