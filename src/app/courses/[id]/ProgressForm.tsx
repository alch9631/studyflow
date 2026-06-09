"use client";

import { applyProgress } from "../actions";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { Textarea } from "@/components/ui/textarea";
import SubmitButton from "@/components/SubmitButton";
import { useT } from "@/components/i18n/I18nProvider";

/**
 * Plain-language progress update. Required field surfaces an inline error and
 * focuses itself if submitted empty. `applyProgress` is unchanged.
 */
export default function ProgressForm({ courseId }: { courseId: string }) {
  const t = useT();
  return (
    <ValidatedForm
      action={applyProgress}
      errorMessage={t("courseDetail.progressError")}
      className="space-y-2"
    >
      <input type="hidden" name="courseId" value={courseId} />
      <Field name="status" label={t("courseDetail.progressQuestion")} labelClassName="sr-only">
        {(p) => (
          <Textarea
            {...p}
            rows={2}
            required
            placeholder={t("courseDetail.progressPlaceholder")}
            className="w-full text-sm"
          />
        )}
      </Field>
      <SubmitButton
        variant="primary"
        size="md"
        className="w-full sm:w-auto"
        pendingLabel={t("courseDetail.applying")}
      >
        {t("courseDetail.applyRebuild")}
      </SubmitButton>
    </ValidatedForm>
  );
}
