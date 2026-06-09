"use client";

import { addAssignment } from "../actions";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import SubmitButton from "@/components/SubmitButton";
import { useT } from "@/components/i18n/I18nProvider";

const LABEL = "block text-xs font-medium text-gray-500 dark:text-gray-400";

/**
 * Accessible "add deadline" form: labelled title + due date, inline required-field
 * errors, focus-the-first-invalid. `addAssignment` is unchanged.
 */
export default function AddDeadlineForm({ courseId }: { courseId: string }) {
  const t = useT();
  return (
    <ValidatedForm
      action={addAssignment}
      successMessage={t("courseDetail.deadlineAdded")}
      errorMessage={t("courseDetail.deadlineAddError")}
      className="mb-3 flex flex-wrap items-start gap-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <Field
        name="title"
        label={t("courseDetail.titleLabel")}
        required
        className="min-w-0 flex-1 text-sm"
        labelClassName={LABEL}
      >
        {(p) => (
          <Input
            {...p}
            required
            maxLength={120}
            placeholder={t("courseDetail.deadlineTitlePlaceholder")}
            className="mt-1 w-full"
          />
        )}
      </Field>
      <Field name="dueDate" label={t("courseDetail.dueLabelField")} required className="text-sm" labelClassName={LABEL}>
        {(p) => <Input {...p} type="date" required className="mt-1" />}
      </Field>
      <SubmitButton variant="primary" size="md" className="mt-5" pendingLabel={t("courseDetail.adding")}>
        {t("courseDetail.add")}
      </SubmitButton>
    </ValidatedForm>
  );
}
