"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toggleCoursePassed } from "@/app/courses/actions";
import { iconButtonClass } from "./ui";
import { useToast } from "./Toast";
import { useT } from "./i18n/I18nProvider";

/**
 * The desktop path to "Modul bestanden" on the My Courses list. Swipe-right
 * covers touch, but SwipeRow deliberately ignores mouse pointers — without
 * this, a desktop user had to open the course and use its header button.
 *
 * Rendered as an overlay SIBLING of the card's <Link> (never nested inside
 * the anchor), shown only on fine-pointer devices and revealed on card hover
 * or keyboard focus. Same action + toasts as the swipe (toggleCoursePassed
 * revalidates the list in place).
 */
export default function MarkPassedButton({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const t = useT();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);

  async function markPassed() {
    if (pending) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("courseId", courseId);
      fd.set("passed", "1");
      const outcome = await toggleCoursePassed(fd);
      if (outcome.ok) {
        toast(t("courses.swipePassedDone", { name: courseName }), "success");
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
    <button
      type="button"
      onClick={markPassed}
      disabled={pending}
      aria-label={t("courses.markPassedAria", { name: courseName })}
      title={t("courseDetail.markPassed")}
      className={iconButtonClass(
        "hidden opacity-0 transition-opacity pointer-fine:inline-flex group-hover/card:opacity-100 focus-visible:opacity-100 bg-white/80 text-emerald-700 shadow-sm backdrop-blur hover:bg-emerald-50 dark:bg-gray-900/80 dark:text-emerald-300 dark:hover:bg-gray-800",
      )}
    >
      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
