"use client";

import { applyProgress } from "../actions";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { buttonClasses } from "@/components/ui";

/**
 * Plain-language progress update. Required field surfaces an inline error and
 * focuses itself if submitted empty. `applyProgress` is unchanged.
 */
export default function ProgressForm({ courseId }: { courseId: string }) {
  return (
    <ValidatedForm
      action={applyProgress}
      errorMessage="Couldn't apply that update — please try again."
      className="space-y-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <Field name="status" label="Where are you at?" labelClassName="sr-only">
        {(p) => (
          <textarea
            {...p}
            rows={2}
            required
            placeholder="In your own words — e.g. 'done with sorting and graphs, still shaky on dynamic programming'"
            className="w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm aria-[invalid]:border-red-500"
          />
        )}
      </Field>
      <button type="submit" className={buttonClasses("primary", "md", "w-full sm:w-auto")}>
        ✨ Apply &amp; rebuild plan
      </button>
    </ValidatedForm>
  );
}
