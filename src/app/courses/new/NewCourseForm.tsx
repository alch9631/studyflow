"use client";

import { createCourse } from "../actions";
import { buttonClasses } from "@/components/ui";
import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 aria-[invalid]:border-red-500";

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
 * Accessible "new course" form: labelled fields, inline validation errors, and
 * focus-the-first-invalid on submit. Wraps the unchanged `createCourse` action.
 */
export default function NewCourseForm() {
  return (
    <ValidatedForm
      action={createCourse}
      errorMessage="Couldn't create that course — check the fields and try again."
      className="space-y-5"
    >
      <Field name="name" label="Course name" required>
        {(p) => (
          <input
            {...p}
            required
            maxLength={100}
            placeholder="e.g. Algorithms"
            className={INPUT_CLASS}
          />
        )}
      </Field>

      <Field name="examDate" label="Exam date" required>
        {(p) => <input {...p} type="date" required className={INPUT_CLASS} />}
      </Field>

      <Field name="topics" label="Topics / chapters (one per line)">
        {(p) => (
          <textarea
            {...p}
            rows={6}
            placeholder={"Sorting\nGraphs\nDynamic programming"}
            className={`${INPUT_CLASS} font-mono text-sm`}
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

      <p className="text-xs text-gray-400 dark:text-gray-500">
        StudyFlow works out how much to study each day to finish before your
        exam — you don&apos;t set the hours.
      </p>

      <button type="submit" className={buttonClasses("primary", "lg")}>
        Create &amp; build my plan
      </button>
    </ValidatedForm>
  );
}
