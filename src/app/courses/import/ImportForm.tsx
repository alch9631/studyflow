"use client";

import { importSyllabus } from "../actions";
import FilePicker from "@/components/FilePicker";
import { buttonClasses } from "@/components/ui";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

/**
 * Accessible syllabus-import form. `enabled` mirrors the server-side AI-key gate
 * (computed in the page); when off, inputs are disabled but still labelled. The
 * `importSyllabus` action is unchanged.
 */
export default function ImportForm({ enabled }: { enabled: boolean }) {
  return (
    <ValidatedForm
      action={importSyllabus}
      errorMessage="Couldn't import that — check the file or text and try again."
      className="space-y-5"
    >
      <div>
        <p className="mb-1 block text-sm font-medium">
          Upload material <span className="text-gray-400 dark:text-gray-500">(PDF, txt, md)</span>
        </p>
        <FilePicker disabled={!enabled} />
      </div>

      <Field name="syllabus" label="…or paste syllabus text">
        {(p) => (
          <textarea
            {...p}
            rows={8}
            disabled={!enabled}
            placeholder="Paste the whole syllabus here — weeks, chapters, exam dates, anything."
            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 font-mono text-xs aria-[invalid]:border-red-500 disabled:bg-gray-100 dark:disabled:bg-gray-800"
          />
        )}
      </Field>

      <fieldset>
        <legend className="block text-sm font-medium">Study days</legend>
        <div className="mt-2 flex flex-wrap gap-3">
          {DAYS.map((d) => (
            <label key={d.v} className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                name="studyDays"
                value={d.v}
                defaultChecked={d.v >= 1 && d.v <= 5}
              />
              {d.label}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="submit" disabled={!enabled} className={buttonClasses("primary", "lg")}>
        ✨ Extract &amp; build my plan
      </button>
    </ValidatedForm>
  );
}
