"use client";

import { applyProgress } from "../actions";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { Textarea } from "@/components/ui/textarea";
import SubmitButton from "@/components/SubmitButton";

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
          <Textarea
            {...p}
            rows={2}
            required
            placeholder="In your own words — e.g. 'done with sorting and graphs, still shaky on dynamic programming'"
            className="w-full text-sm"
          />
        )}
      </Field>
      <SubmitButton
        variant="primary"
        size="md"
        className="w-full sm:w-auto"
        pendingLabel="Applying…"
      >
        ✨ Apply &amp; rebuild plan
      </SubmitButton>
    </ValidatedForm>
  );
}
