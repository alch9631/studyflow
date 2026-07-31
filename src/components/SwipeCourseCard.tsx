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
 * The {@link CourseCard} is passed as `children` so all its existing
 * affordances (tap-to-open, the ⋯ settings menu) keep working untouched; the
 * swipe is purely additive and a no-op on non-touch devices.
 */
export default function SwipeCourseCard({
  courseId,
  courseName,
  passed = false,
  children,
}: {
  courseId: string;
  courseName: string;
  /** Course already counts as passed — the right swipe becomes its undo. */
  passed?: boolean;
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

  return (
    <>
      <SwipeRow
        className="rounded-2xl"
        right={{
          label: passed ? t("courses.swipeNotPassed") : t("courses.swipePassed"),
          icon: passed ? (
            <Undo2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ),
          tone: passed ? "neutral" : "success",
          onTrigger: togglePassed,
        }}
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
