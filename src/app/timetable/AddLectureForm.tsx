"use client";

import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { buttonClasses, panelClass } from "@/components/ui";
import { addLecture } from "./actions";

const DAYS = [
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
  { v: 0, label: "Sunday" },
];

const INPUT =
  "mt-1 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 aria-[invalid]:border-red-500";
const LABEL = "block text-xs font-medium text-gray-500 dark:text-gray-400";

/** "HH:MM" -> minutes from midnight, or null when unparseable. */
function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Client-validated form for adding a recurring class. The server action silently
 * skips entries where end ≤ start; here we surface that inline (focused on the
 * End field) so the user gets immediate, accessible feedback. The action and its
 * FormData contract are unchanged.
 */
export default function AddLectureForm({
  courses,
}: {
  courses: { id: string; name: string }[];
}) {
  function validate(data: FormData): Record<string, string> | null {
    const start = toMinutes(String(data.get("start") ?? ""));
    const end = toMinutes(String(data.get("end") ?? ""));
    if (start != null && end != null && end <= start) {
      return { end: "End time must be after the start time." };
    }
    return null;
  }

  return (
    <ValidatedForm
      action={addLecture}
      successMessage="Class added to your timetable."
      errorMessage="Couldn't add that class — check the times and try again."
      validate={validate}
      className={`${panelClass} mb-6 space-y-3 p-4`}
    >
      <div className="flex flex-wrap gap-3">
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
              placeholder="e.g. Analysis I — Vorlesung"
              className={`${INPUT} w-full`}
            />
          )}
        </Field>
        <Field name="weekday" label="Day" className="text-sm" labelClassName={LABEL}>
          {(p) => (
            <select {...p} defaultValue="1" className={INPUT}>
              {DAYS.map((d) => (
                <option key={d.v} value={d.v}>
                  {d.label}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field name="start" label="Start" required className="text-sm" labelClassName={LABEL}>
          {(p) => <input {...p} type="time" required defaultValue="10:00" className={INPUT} />}
        </Field>
        <Field name="end" label="End" required className="text-sm" labelClassName={LABEL}>
          {(p) => <input {...p} type="time" required defaultValue="12:00" className={INPUT} />}
        </Field>
        <Field
          name="location"
          label="Room (optional)"
          className="min-w-0 flex-1 text-sm"
          labelClassName={LABEL}
        >
          {(p) => (
            <input {...p} placeholder="e.g. Audimax I" className={`${INPUT} w-full`} />
          )}
        </Field>
      </div>
      {courses.length > 0 && (
        <Field
          name="courseId"
          label="Link to course (optional)"
          className="block text-sm"
          labelClassName={LABEL}
        >
          {(p) => (
            <select {...p} defaultValue="" className={`${INPUT} w-full`}>
              <option value="">—</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}
      <button type="submit" className={buttonClasses("primary", "lg")}>
        Add class
      </button>
    </ValidatedForm>
  );
}
