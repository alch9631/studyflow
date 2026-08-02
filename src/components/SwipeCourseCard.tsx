"use client";

import { useState, type ReactNode } from "react";
import { Trash2, CheckCircle2, Undo2 } from "lucide-react";
import { deleteCourse, toggleCoursePassed } from "@/app/courses/actions";
import SwipeRow from "./SwipeRow";
import { useToast } from "./Toast";
import { Button } from "./ui/button";
import SubmitButton from "./SubmitButton";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { useT } from "./i18n/I18nProvider";

/**
 * Swipe actions for a course row on the My Courses list.
 *
 * RIGHT → "Modul bestanden": marks the module complete (and swiping a completed
 * one again undoes it). It fires straight away — unlike delete, it's fully
 * reversible, so a confirmation dialog would just be friction on the happy path
 * — and reports through a toast, since the card's own state only updates once
 * the revalidated list comes back.
 *
 * LEFT → "Delete": opens the same confirmation dialog the card's ⋯ menu uses.
 * Deleting a whole course (with its topics, deadlines and plan) is
 * irreversible, so it always confirms rather than relying on an undo window.
 *
 * The card is passed as `children` so all its existing affordances
 * (tap-to-open, the grade form on the Passed page) keep working untouched; the
 * swipe is purely additive and a no-op on non-touch devices.
 */
export default function SwipeCourseCard({
  courseId,
  courseName,
  passed = false,
  canUndoPass = false,
  progressCount = 0,
  children,
}: {
  courseId: string;
  courseName: string;
  /** Course already counts as passed — the right swipe becomes its undo. */
  passed?: boolean;
  /**
   * Whether clearing the bestanden flag would actually re-open the module.
   * False when the pass comes from (or is also backed by) a passing GRADE —
   * clearing the flag then changes nothing, so no undo swipe is offered and
   * editing the grade is the real undo. The caller computes this with
   * coursePassed({ grade, passed: false }).
   */
  canUndoPass?: boolean;
  /**
   * Real progress that deleting would destroy: completed study sessions + done
   * topics. When > 0 the delete confirm shows a stronger "deleting is
   * permanent" warning so a course with history isn't dropped on a careless
   * swipe.
   */
  progressCount?: number;
  children: ReactNode;
}) {
  const t = useT();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function togglePassed() {
    if (pending) return;
    setPending(true);
    const next = !passed;
    try {
      const fd = new FormData();
      fd.set("courseId", courseId);
      fd.set("passed", next ? "1" : "0");
      const outcome = await toggleCoursePassed(fd);
      if (outcome.ok) {
        toast(
          next
            ? t("courses.swipePassedDone", { name: courseName })
            : t("courses.swipePassedUndone", { name: courseName }),
          "success",
        );
      } else {
        toast(
          outcome.reason === "rate-limited"
            ? t("courses.rateLimited")
            : t("courses.swipePassedError"),
          "error",
        );
      }
    } catch {
      toast(t("courses.swipePassedError"), "error");
    } finally {
      setPending(false);
    }
  }

  // A pass backed by a passing GRADE can't be undone by the flag toggle —
  // clearing the flag would change nothing (the grade still passes) while
  // silently destroying the bestanden mark. The undo swipe only shows when it
  // genuinely re-opens the module; editing the grade is the real undo otherwise.
  const right =
    passed && !canUndoPass
      ? undefined
      : {
          label: passed ? t("courses.swipeNotPassed") : t("courses.swipePassed"),
          icon: passed ? (
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ),
          tone: (passed ? "neutral" : "success") as "neutral" | "success",
          onTrigger: togglePassed,
        };

  return (
    <>
      <SwipeRow
        className="rounded-2xl"
        right={right}
        left={{
          label: t("courses.swipeDelete"),
          icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
          tone: "danger",
          onTrigger: () => setConfirmOpen(true),
        }}
      >
        {children}
      </SwipeRow>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{t("courses.deleteTitle")}</DialogTitle>
          <DialogDescription>
            {t("courses.deleteDescPre")} <strong>{courseName}</strong>{" "}
            {t("courses.deleteDescPost")}
            {progressCount > 0 && (
              <span className="mt-2 block font-medium text-red-600 dark:text-red-400">
                {t("courses.deleteProgressWarning", { count: progressCount })}
              </span>
            )}
          </DialogDescription>
          <form action={deleteCourse} className="mt-5 flex justify-end gap-2">
            <input type="hidden" name="courseId" value={courseId} />
            {/* Return path: deleting from the Passed page must land back on it,
                not on the active list. */}
            <input type="hidden" name="from" value={passed ? "passed" : ""} />
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
