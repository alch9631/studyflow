"use client";

import { useState } from "react";
import { saveStudyTask } from "@/app/courses/studyActions";
import type { StudyTask } from "@/lib/studyTask";
import { useT } from "./i18n/I18nProvider";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Select } from "./ui/select";
import SubmitButton from "./SubmitButton";
import ValidatedForm from "./ValidatedForm";

export default function StudyTaskForm({ courseId, topicId, title = "", task, materials }: {
  courseId: string; topicId?: string; title?: string; task?: StudyTask | null;
  materials: { id: string; filename: string }[];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="mt-3 rounded-xl border border-border bg-surface">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium text-brand-ink">
        {topicId ? t(task ? "study.editTask" : "flow.customTask") : t("flow.customTask")}
      </summary>
      <ValidatedForm action={saveStudyTask} successMessage={t("study.taskSaved")} errorMessage={t("study.taskError")}
        onDone={() => setOpen(false)} className="space-y-4 border-t border-border p-3">
        <input type="hidden" name="courseId" value={courseId} />
        {topicId && <input type="hidden" name="topicId" value={topicId} />}
        <label className="block text-sm font-medium">
          {t("study.title")}<Input name="title" required maxLength={200} defaultValue={title} className="mt-1 w-full" />
        </label>
        <label className="block text-sm font-medium">
          {t("study.instruction")}<Textarea name="instruction" required maxLength={2000} rows={2} defaultValue={task?.instruction}
            placeholder={t("study.instructionPlaceholder")} className="mt-1 w-full" />
        </label>
        <label className="block text-sm font-medium">
          {t("study.criteria")}<Textarea name="successCriteria" required maxLength={2000} rows={2} defaultValue={task?.successCriteria}
            placeholder={t("study.criteriaPlaceholder")} className="mt-1 w-full" />
        </label>
        <label className="block text-sm font-medium">
          {t("study.estimate")}<Input name="estimatedMinutes" type="number" min={5} max={600} step={1} required
            defaultValue={task?.estimatedMinutes ?? 30} className="mt-1 w-full" />
        </label>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold">{t("study.source")}</legend>
          <label className="block text-sm">
            {t("study.sourceFile")}<Select name="sourceFileId" defaultValue={task?.sourceFileId ?? ""} className="mt-1 w-full">
              <option value="">{t("study.noFile")}</option>
              {materials.map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}
            </Select>
          </label>
          <label className="block text-sm">
            {t("study.sourceLink")}<Input name="sourceUrl" type="url" maxLength={2000} defaultValue={task?.sourceUrl ?? ""} placeholder="https://…" className="mt-1 w-full" />
          </label>
          <label className="block text-sm">
            {t("study.sourceRef")}<Input name="sourceRef" maxLength={300} defaultValue={task?.sourceRef} placeholder={t("study.sourceRefPlaceholder")} className="mt-1 w-full" />
          </label>
        </fieldset>
        <details className="rounded-lg bg-surface-muted p-3" open={!!task?.checkQuestion || undefined}>
          <summary className="min-h-11 cursor-pointer text-sm font-medium">{t("study.addCheck")}</summary>
          <label className="mt-2 block text-sm">
            {t("study.question")}<Textarea name="checkQuestion" maxLength={2000} rows={2} defaultValue={task?.checkQuestion} className="mt-1 w-full" />
          </label>
          <label className="mt-3 block text-sm">
            {t("study.answerKey")}<Textarea name="answerKey" maxLength={4000} rows={3} defaultValue={task?.answerKey} className="mt-1 w-full" />
          </label>
        </details>
        <SubmitButton className="w-full" pendingLabel={t("study.saving")}>{t("study.saveTask")}</SubmitButton>
      </ValidatedForm>
    </details>
  );
}
