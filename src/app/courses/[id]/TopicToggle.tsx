"use client";

import OptimisticToggleForm from "@/components/OptimisticToggleForm";
import { toggleTopic } from "../actions";

/**
 * Client wrapper for a course topic's optimistic done-toggle.
 *
 * Lives in a client module so it can pass a render function to
 * {@link OptimisticToggleForm} (a function child cannot cross the
 * server→client boundary). The server page renders `<TopicToggle … />` with
 * plain, serializable props only.
 */
export default function TopicToggle({
  topicId,
  courseId,
  title,
  done: doneProp,
}: {
  topicId: string;
  courseId: string;
  title: string;
  done: boolean;
}) {
  return (
    <OptimisticToggleForm
      action={toggleTopic}
      done={doneProp}
      doneMessage="Topic done — plan updated. ✓"
      undoneMessage="Topic reopened — plan updated."
      errorMessage="Couldn't update that topic — please try again."
      swipe={{ completeLabel: "Done", reopenLabel: "Reopen" }}
      className="flex items-start gap-2 rounded-lg bg-background py-0.5"
    >
      {(done) => (
        <>
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="courseId" value={courseId} />
          <button
            type="submit"
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
              done
                ? "border-green-500 bg-green-500 text-white"
                : "border-gray-300 dark:border-gray-700"
            }`}
            aria-pressed={done}
            aria-label={done ? "Mark not done" : "Mark done"}
          >
            {done ? "✓" : ""}
          </button>
          <span className={`min-w-0 break-words ${done ? "text-gray-500 dark:text-gray-400 line-through" : ""}`}>
            {title}
          </span>
        </>
      )}
    </OptimisticToggleForm>
  );
}
