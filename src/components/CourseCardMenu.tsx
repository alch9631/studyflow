"use client";

import { useState, type MouseEvent } from "react";
import { MoreHorizontal, Download, Trash2 } from "lucide-react";
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
  progressCount = 0,
}: {
  courseId: string;
  courseName: string;
  /**
   * Real progress that deleting would destroy: completed study sessions + done
   * topics. When > 0 the confirm shows a stronger "deleting is permanent"
   * warning so a course with history isn't dropped on a careless tap. Computed
   * on the server (the My Courses page already loads each course's topics/blocks)
   * and threaded down through the card.
   */
  progressCount?: number;
}) {
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteProgressWarning =
    progressCount > 0
      ? t.locale === "de"
        ? `Dieser Kurs hat ${progressCount} abgeschlossene Lernsession(s) / erledigte Themen — das Löschen ist endgültig.`
        : `This course has ${progressCount} completed sessions / done topics — deleting is permanent.`
      : null;

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
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="truncate">{courseName}</DropdownMenuLabel>

          <DropdownMenuItem asChild>
            <a href="/api/export?format=json">
              <Download className="h-4 w-4" aria-hidden="true" />
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
            <Trash2 className="h-4 w-4" aria-hidden="true" />
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
            {deleteProgressWarning && (
              <span className="mt-2 block font-medium text-red-600 dark:text-red-400">
                ⚠️ {deleteProgressWarning}
              </span>
            )}
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
