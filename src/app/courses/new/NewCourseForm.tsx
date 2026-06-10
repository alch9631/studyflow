"use client";

import { createCourse } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/components/i18n/I18nProvider";

const DAYS = [
  { v: 1, key: "Mo" },
  { v: 2, key: "Tu" },
  { v: 3, key: "We" },
  { v: 4, key: "Th" },
  { v: 5, key: "Fr" },
  { v: 6, key: "Sa" },
  { v: 0, key: "Su" },
] as const;

/**
 * Accessible "new course" form: labelled fields, inline validation errors, and
 * focus-the-first-invalid on submit. Wraps the unchanged `createCourse` action.
 */
export default function NewCourseForm() {
  const t = useT();
  return (
    <ValidatedForm
      action={createCourse}
      errorMessage={t("newCourse.formError")}
      className="space-y-4"
    >
      <Field name="name" label={t("newCourse.name")} required>
        {(p) => (
          <Input
            {...p}
            required
            maxLength={100}
            placeholder={t("newCourse.namePlaceholder")}
            className="mt-1 w-full"
          />
        )}
      </Field>

      <Field name="examDate" label={t("newCourse.examDate")} required>
        {(p) => <Input {...p} type="date" required className="mt-1 w-full" />}
      </Field>

      <Field name="topics" label={t("newCourse.topics")}>
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            placeholder={t("newCourse.topicsPlaceholder")}
            className="mt-1 w-full font-mono text-sm"
          />
        )}
      </Field>

      <fieldset>
        <legend className="block text-sm font-medium">{t("newCourse.studyDays")}</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {DAYS.map((d) => (
            <label key={d.v} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="studyDays"
                value={d.v}
                defaultChecked={d.v >= 1 && d.v <= 5}
              />
              {t(`charts.weekdaysShort.${d.key}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        {t("newCourse.hint")}
      </p>

      <SubmitButton variant="primary" size="lg" pendingLabel={t("newCourse.creating")}>
        {t("newCourse.submit")}
      </SubmitButton>
    </ValidatedForm>
  );
}
