"use client";

import { addAssignment } from "../actions";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import SubmitButton from "@/components/SubmitButton";

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
          <Input
            {...p}
            required
            maxLength={120}
            placeholder="e.g. Übungsblatt 5"
            className="mt-1 w-full"
          />
        )}
      </Field>
      <Field name="dueDate" label="Due" required className="text-sm" labelClassName={LABEL}>
        {(p) => <Input {...p} type="date" required className="mt-1" />}
      </Field>
      <SubmitButton variant="primary" size="md" className="mt-5" pendingLabel="Adding…">
        Add
      </SubmitButton>
    </ValidatedForm>
  );
}
