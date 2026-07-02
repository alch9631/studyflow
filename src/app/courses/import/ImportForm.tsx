"use client";

import { importSyllabus } from "../actions";
import FilePicker from "@/components/FilePicker";
import SubmitButton from "@/components/SubmitButton";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
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
 * Accessible syllabus-import form. `enabled` mirrors the server-side AI-key gate
 * (computed in the page); when off, inputs are disabled but still labelled. The
 * `importSyllabus` action is unchanged.
 */
export default function ImportForm({ enabled }: { enabled: boolean }) {
  const t = useT();
  return (
    <ValidatedForm
      action={importSyllabus}
      errorMessage={t("importCourse.formError")}
      // Cross-field rule the browser can't express: at least ONE of pasted text
      // or an uploaded file. Mirrors the server's empty-submit reject so most
      // users never round-trip for it.
      validate={(fd) => {
        const raw = fd.get("syllabus");
        const text = typeof raw === "string" ? raw.trim() : "";
        const file = fd.get("file");
        const hasFile = file instanceof File && file.size > 0;
        return !text && !hasFile ? { syllabus: t("importCourse.emptyError") } : null;
      }}
      className="space-y-5"
    >
      <div>
        <p className="mb-1 block text-sm font-medium">
          {t("importCourse.uploadLabel")} <span className="text-gray-500 dark:text-gray-400">{t("importCourse.uploadFormats")}</span>
        </p>
        <FilePicker disabled={!enabled} />
      </div>

      <Field name="syllabus" label={t("importCourse.pasteLabel")}>
        {(p) => (
          <Textarea
            {...p}
            rows={8}
            disabled={!enabled}
            placeholder={t("importCourse.pastePlaceholder")}
            className="mt-1 w-full font-mono text-xs disabled:bg-gray-100 dark:disabled:bg-gray-800"
          />
        )}
      </Field>

      <fieldset>
        <legend className="block text-sm font-medium">{t("importCourse.studyDays")}</legend>
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

      <SubmitButton
        variant="primary"
        size="lg"
        disabled={!enabled}
        pendingLabel={t("importCourse.extracting")}
      >
        {t("importCourse.submit")}
      </SubmitButton>
    </ValidatedForm>
  );
}
