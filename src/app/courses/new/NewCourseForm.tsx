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
  // Browser-side bounds matching the server's date-reject rule (today … +2y).
  // The server still validates; these just block the obvious cases up front.
  const todayIso = new Date().toISOString().slice(0, 10);
  const maxIso = `${Number(todayIso.slice(0, 4)) + 2}${todayIso.slice(4)}`;
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
        {(p) => (
          <Input {...p} type="date" required min={todayIso} max={maxIso} className="mt-1 w-full" />
        )}
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

      <Field
        name="difficulty"
        label={t("newCourse.difficulty")}
        hint={t("newCourse.difficultyHint")}
      >
        {(p) => (
          <select
            {...p}
            defaultValue="3"
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
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
