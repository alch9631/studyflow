"use client";

import ValidatedForm from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import SubmitButton from "@/components/SubmitButton";
import { panelClass } from "@/components/ui";
import { useT } from "@/components/i18n/I18nProvider";
import { addLecture } from "./actions";

const DAYS = [
  { v: 1, key: "Mo" },
  { v: 2, key: "Tu" },
  { v: 3, key: "We" },
  { v: 4, key: "Th" },
  { v: 5, key: "Fr" },
  { v: 6, key: "Sa" },
  { v: 0, key: "Su" },
] as const;

const INPUT = "mt-1";
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
  const t = useT();

  function validate(data: FormData): Record<string, string> | null {
    const start = toMinutes(String(data.get("start") ?? ""));
    const end = toMinutes(String(data.get("end") ?? ""));
    if (start != null && end != null && end <= start) {
      return { end: t("timetable.endAfterStart") };
    }
    return null;
  }

  return (
    <ValidatedForm
      action={addLecture}
      successMessage={t("timetable.addSuccess")}
      errorMessage={t("timetable.addError")}
      validate={validate}
      className={`${panelClass} mb-6 space-y-3 p-4`}
    >
      <div className="flex flex-wrap gap-3">
        <Field
          name="title"
          label={t("timetable.fTitle")}
          required
          className="min-w-0 flex-1 text-sm"
          labelClassName={LABEL}
        >
          {(p) => (
            <Input
              {...p}
              required
              maxLength={120}
              placeholder={t("timetable.fTitlePlaceholder")}
              className={`${INPUT} w-full`}
            />
          )}
        </Field>
        <Field name="weekday" label={t("timetable.fDay")} className="text-sm" labelClassName={LABEL}>
          {(p) => (
            <Select {...p} defaultValue="1" className={INPUT}>
              {DAYS.map((d) => (
                <option key={d.v} value={d.v}>
                  {t(`charts.weekdays.${d.key}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-3">
        <Field name="start" label={t("timetable.fStart")} required className="text-sm" labelClassName={LABEL}>
          {(p) => <Input {...p} type="time" required defaultValue="10:00" className={INPUT} />}
        </Field>
        <Field name="end" label={t("timetable.fEnd")} required className="text-sm" labelClassName={LABEL}>
          {(p) => <Input {...p} type="time" required defaultValue="12:00" className={INPUT} />}
        </Field>
        <Field
          name="location"
          label={t("timetable.fRoom")}
          className="min-w-0 flex-1 text-sm"
          labelClassName={LABEL}
        >
          {(p) => (
            <Input {...p} placeholder={t("timetable.fRoomPlaceholder")} className={`${INPUT} w-full`} />
          )}
        </Field>
      </div>
      {courses.length > 0 && (
        <Field
          name="courseId"
          label={t("timetable.fLinkCourse")}
          className="block text-sm"
          labelClassName={LABEL}
        >
          {(p) => (
            <Select {...p} defaultValue="" className={`${INPUT} w-full`}>
              <option value="">—</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <SubmitButton variant="primary" size="lg" pendingLabel={t("timetable.adding")}>
        {t("timetable.addClass")}
      </SubmitButton>
    </ValidatedForm>
  );
}
