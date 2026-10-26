"use client";

import { startStudyPlan } from "./actions";
import ValidatedForm from "@/components/ValidatedForm";
import SubmitButton from "@/components/SubmitButton";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import { useLocale, useT } from "@/components/i18n/I18nProvider";
import { UPLOAD_ACCEPT } from "@/lib/fileText";

const DAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

export default function StartForm({ requestId, budget, dayStart, dayEnd, today }: { requestId: string; budget: number; dayStart: string; dayEnd: string; today: string }) {
  const t = useT();
  const language = useLocale();
  return <ValidatedForm action={startStudyPlan} errorMessage={t("start.error")} className="space-y-5"
    validate={(data) => ({ ...(!data.getAll("studyDays").length ? { studyDays: t("start.daysError") } : {}),
      ...(!(data.get("file") instanceof File && (data.get("file") as File).size > 0) && !String(data.get("sourceRef") ?? "").trim() ? { sourceRef: t("start.sourceError") } : {}) })}>
    <input type="hidden" name="requestId" value={requestId} /><input type="hidden" name="language" value={language} />
    <Field name="name" label={t("newCourse.name")} required>{(props) => <Input {...props} autoComplete="off" required maxLength={100} placeholder={t("newCourse.namePlaceholder")} className="mt-1 w-full" />}</Field>
    <Field name="examDate" label={t("newCourse.examDate")} required>{(props) => <Input {...props} type="date" required min={today} className="mt-1 w-full" />}</Field>
    <Field name="dailyBudgetMin" label={t("study.dailyBudget")} hint={t("start.budgetHint")} required>{(props) => <Input {...props} type="number" min={15} max={360} step={15} required defaultValue={budget} className="mt-1 w-full" />}</Field>
    <Field name="studyDays" label={t("newCourse.studyDays")}>{(props) => <div role="group" aria-label={t("newCourse.studyDays")} aria-describedby={props["aria-describedby"]} className="mt-2 flex flex-wrap gap-3">
      {([1,2,3,4,5,6,0] as const).map((day, index) => <label key={day} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="studyDays" value={day} defaultChecked={day > 0 && day < 6} />{t(`charts.weekdaysShort.${DAY_NAMES[index]}`)}</label>)}
    </div>}</Field>
    <details><summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{t("start.window")}</summary><div className="mt-2 grid grid-cols-2 gap-3">
      <Field name="dayStart" label={t("settings.studyWindowStart")}>{(props) => <Input {...props} type="time" defaultValue={dayStart} className="mt-1 w-full" />}</Field>
      <Field name="dayEnd" label={t("settings.studyWindowEnd")}>{(props) => <Input {...props} type="time" defaultValue={dayEnd} className="mt-1 w-full" />}</Field>
    </div></details>
    <Field name="file" label={t("start.material")} hint={t("start.materialHint")}>{(props) => <Input {...props} type="file" accept={UPLOAD_ACCEPT} className="mt-2 w-full" />}</Field>
    <Field name="sourceRef" label={t("start.ownNotes")} hint={t("start.ownNotesHint")}>{(props) => <Input {...props} maxLength={300} placeholder={t("study.sourceRefPlaceholder")} className="mt-1 w-full" />}</Field>
    <SubmitButton variant="primary" size="lg" className="w-full" pendingLabel={t("study.saving")}>{t("start.continue")}</SubmitButton>
  </ValidatedForm>;
}
