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
import { useT } from "./i18n/I18nProvider";

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
  const t = useT();
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
          aria-label={t("courses.menuOpen", { name: courseName })}
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
              {t("courses.export")}
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
            {t("courses.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{t("courses.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("courses.deleteDescPre")} <strong>{courseName}</strong>{" "}
            {t("courses.deleteDescPost")}
          </DialogDescription>
          <form action={deleteCourse} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="courseId" value={courseId} />
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              {t("courses.cancel")}
            </Button>
            <SubmitButton variant="danger-solid" pendingLabel={t("courses.deleting")}>
              {t("courses.delete")}
            </SubmitButton>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
