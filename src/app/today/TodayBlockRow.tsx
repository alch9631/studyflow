"use client";

import { useRef } from "react";
import { Check, Undo2, BookOpen } from "lucide-react";
import SwipeRow from "@/components/SwipeRow";
import { useOptimisticToggle } from "@/components/useOptimisticToggle";
import { hitTargetClass } from "@/components/ui";
import { useT } from "@/components/i18n/I18nProvider";
import { toggleBlock } from "../courses/actions";

export type TodayBlock = {
  id: string;
  topicTitle: string;
  minutes: number;
  completed: boolean;
  kind: string;
  actualMinutes: number | null;
  course: { name: string; id: string };
};

/**
 * A single Today study-block row, with both affordances wired to the same
 * optimistic toggle ({@link useOptimisticToggle}):
 *   - tap the checkbox      → mark done / not-done (with an Undo toast)
 *   - swipe right           → complete (revealed green ✓ panel)
 *   - swipe left            → reopen (revealed neutral panel)
 *   - the 🍅 focus button   → unchanged
 *
 * The whole row is swipeable (the checkbox-toggle `<form>`, the minutes, and the
 * focus `<form>` are siblings inside the swipe surface — never nested forms).
 * Light haptics fire on toggle/commit; everything degrades to plain taps where
 * touch/vibration isn't available.
 */
export default function TodayBlockRow({ b }: { b: TodayBlock }) {
  const t = useT();
  const isReview = b.kind === "review";
  const { optimisticDone, fire } = useOptimisticToggle({
    action: toggleBlock,
    actionId: "toggleBlock",
    done: b.completed,
    doneMessage: t("block.sessionDone"),
    undoneMessage: t("block.sessionNotDone"),
    errorMessage: t("block.sessionError"),
    fields: { blockId: b.id, revalidate: "/today" },
  });
  const formRef = useRef<HTMLFormElement>(null);
  const formData = () => new FormData(formRef.current ?? undefined);

  return (
    <SwipeRow
      className="rounded-xl"
      contentClassName="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3"
      right={
        optimisticDone
          ? undefined
          : { label: t("block.done"), icon: <Check className="h-4 w-4" aria-hidden="true" />, tone: "success", onTrigger: () => fire(formData(), true, true) }
      }
      left={
        optimisticDone
          ? { label: t("block.reopen"), icon: <Undo2 className="h-4 w-4" aria-hidden="true" />, tone: "neutral", onTrigger: () => fire(formData(), false, true) }
          : undefined
      }
    >
      <form
        ref={formRef}
        action={(fd) => fire(fd, !optimisticDone, true)}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <input type="hidden" name="blockId" value={b.id} />
        <input type="hidden" name="revalidate" value="/today" />
        <button
          type="submit"
          className={`${hitTargetClass} h-6 w-6 shrink-0 rounded border transition-colors ${
            optimisticDone
              ? "border-green-500 bg-green-500 text-white"
              : "border-gray-300 dark:border-gray-700 hover:border-gray-500"
          }`}
          aria-pressed={optimisticDone}
          aria-label={optimisticDone ? t("block.markNotDone") : t("block.markDone")}
        >
          {optimisticDone ? <Check className="h-4 w-4" aria-hidden="true" /> : null}
        </button>
        <span className="min-w-0 flex-1">
          <span
            className={`block break-words ${
              optimisticDone ? "text-gray-500 dark:text-gray-400 line-through" : "font-medium"
            }`}
          >
            {b.topicTitle}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {isReview && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {t("block.review")}
              </span>
            )}
            <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{b.course.name}</span>
            </span>
          </span>
        </span>
      </form>
    </SwipeRow>
  );
}
