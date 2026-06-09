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
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <SwipeRow
        className="rounded-2xl"
        left={{
          label: "Delete",
          icon: "🗑",
          tone: "danger",
          onTrigger: () => setConfirmOpen(true),
        }}
      >
        {children}
      </SwipeRow>

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
