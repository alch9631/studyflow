"use client";

import OptimisticToggleForm from "@/components/OptimisticToggleForm";
import { toggleBlock } from "../courses/actions";

/**
 * Client wrapper for a Today study-block's optimistic done-toggle.
 *
 * Lives in a client module so it can pass a render function to
 * {@link OptimisticToggleForm} (a function child cannot cross the
 * server→client boundary). The server page renders `<BlockToggle … />` with
 * plain, serializable props only.
 */
export default function BlockToggle({
  blockId,
  topicTitle,
  courseName,
  completed,
  isReview,
}: {
  blockId: string;
  topicTitle: string;
  courseName: string;
  completed: boolean;
  isReview: boolean;
}) {
  return (
    <OptimisticToggleForm
      action={toggleBlock}
      done={completed}
      doneMessage="Nice — session done! ✓"
      undoneMessage="Session marked not done."
      errorMessage="Couldn't update that session — please try again."
      className="flex min-w-0 flex-1 items-center gap-3"
    >
      {(done) => (
        <>
          <input type="hidden" name="blockId" value={blockId} />
          <input type="hidden" name="revalidate" value="/today" />
          <button
            type="submit"
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors ${
              done
                ? "border-green-500 bg-green-500 text-white"
                : "border-gray-300 dark:border-gray-700 hover:border-gray-500"
            }`}
            aria-pressed={done}
            aria-label={done ? "Mark not done" : "Mark done"}
          >
            {done ? "✓" : ""}
          </button>
          <span className="min-w-0 flex-1">
            <span className={`block break-words ${done ? "text-gray-500 dark:text-gray-400 line-through" : "font-medium"}`}>
              {topicTitle}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              {isReview && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  🔁 Review
                </span>
              )}
              <span className="inline-flex min-w-0 items-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <span className="truncate">📘 {courseName}</span>
              </span>
            </span>
          </span>
        </>
      )}
    </OptimisticToggleForm>
  );
}
