"use client";

import { addAssignment } from "../actions";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";

const LABEL = "block text-xs font-medium text-gray-500 dark:text-gray-400";

/**
 * Accessible "add deadline" form: labelled title + due date, inline required-field
 * errors, focus-the-first-invalid. `addAssignment` is unchanged.
 */
export default function AddDeadlineForm({ courseId }: { courseId: string }) {
  return (
    <ValidatedForm
      action={addAssignment}
      successMessage="Deadline added."
      errorMessage="Couldn't add that deadline — check the fields and try again."
      className="mb-3 flex flex-wrap items-start gap-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <Field
        name="title"
        label="Title"
        required
        className="min-w-0 flex-1 text-sm"
        labelClassName={LABEL}
      >
        {(p) => (
          <input
            {...p}
            required
            maxLength={120}
            placeholder="e.g. Übungsblatt 5"
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 aria-[invalid]:border-red-500"
          />
        )}
      </Field>
      <Field name="dueDate" label="Due" required className="text-sm" labelClassName={LABEL}>
        {(p) => (
          <input
            {...p}
            type="date"
            required
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 aria-[invalid]:border-red-500"
          />
        )}
      </Field>
      <button
        type="submit"
        className="mt-5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Add
      </button>
    </ValidatedForm>
  );
}
