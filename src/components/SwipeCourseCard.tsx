"use client";

import { useState, type ReactNode } from "react";
import { deleteCourse } from "@/app/courses/actions";
import SwipeRow from "./SwipeRow";
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
 * Adds swipe-to-delete to a course row on the My Courses list. Swiping a card
 * left reveals a red "Delete" panel; committing it opens the same confirmation
 * dialog the card's ⋯ menu uses — deleting a whole course (with its topics,
 * deadlines, and plan) is irreversible, so it always confirms rather than
 * relying on a fragile undo window.
 *
 * The {@link CourseCard} is passed as `children` so all its existing
 * affordances (tap-to-open, the ⋯ settings menu) keep working untouched; the
 * swipe is purely additive and a no-op on non-touch devices.
 */
export default function SwipeCourseCard({
  courseId,
  courseName,
  children,
}: {
  courseId: string;
  courseName: string;
  children: ReactNode;
}) {
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <SwipeRow
        className="rounded-2xl"
        left={{
          label: t("courses.swipeDelete"),
          icon: "🗑",
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
