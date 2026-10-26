"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { prepareMaterialTasks, prepareMaterialPlan, addMaterialTasks } from "@/app/courses/studyActions";
import { readMaterialOutline, type MaterialOutline } from "@/lib/documentOutline";
import { readStudyDrafts, type StudyDraftSet } from "@/lib/studyDraft";
import { useLocale, useT } from "./i18n/I18nProvider";
import { useToast } from "./Toast";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import QuickStudySetup from "./QuickStudySetup";
import MaterialOutlineReview from "./MaterialOutlineReview";
import MaterialRecognitionStatus from "./MaterialRecognitionStatus";

export default function MaterialStudyActions({ fileId, courseId, filename, stored, analysis, autoOpen = false }: {
  fileId: string; courseId: string; filename: string; stored: string | null; analysis: string | null; autoOpen?: boolean;
}) {
  const t = useT(); const language = useLocale(); const router = useRouter(); const { toast } = useToast();
  const [open, setOpen] = useState(autoOpen);
  const [drafts, setDrafts] = useState<StudyDraftSet | null>(() => readStudyDrafts(stored));
  const [selected, setSelected] = useState<string[]>(() => readStudyDrafts(stored)?.items.map((item) => item.id) ?? []);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [outline, setOutline] = useState<MaterialOutline | null>(() => readMaterialOutline(analysis));
  const [prepared, setPrepared] = useState(!!readMaterialOutline(analysis));
  const [smallTasks, setSmallTasks] = useState(false);
  const preparing = useRef(false);
  const onRecognized = useCallback((recognized: MaterialOutline | null) => {
    setOutline(recognized);
    setPrepared(!!recognized);
  }, []);
  useEffect(() => {
    if (!open || prepared || preparing.current) return;
    preparing.current = true;
    void prepareMaterialPlan(fileId, language).then((result) => {
      if (!result.ok) { setError(result.error); return; }
      if ("outline" in result) setOutline(result.outline);
      else { setDrafts(result.drafts); setSelected(result.drafts.items.map((item) => item.id)); }
      setPrepared(true);
    }).catch(() => setError("PREPARE_FAILED")).finally(() => { preparing.current = false; });
  }, [open, prepared, fileId, language]);

  async function showSmallTasks() {
    setPending(true);
    try {
      const result = await prepareMaterialTasks(fileId, language);
      if (!result.ok) { toast(t("flow.prepareError"), "error"); return; }
      setDrafts(result.drafts); setSelected(result.drafts.items.map((item) => item.id)); setSmallTasks(true);
    } catch { toast(t("flow.prepareError"), "error"); } finally { setPending(false); }
  }

  async function accept(start: boolean) {
    if (!drafts || pending || !selected.length) return;
    setPending(true);
    try {
      const result = await addMaterialTasks(fileId, drafts.id, selected, start);
      if (!result.ok) { toast(t("study.taskError"), "error"); return; }
      toast(t(result.allDone ? "flow.allDone" : "study.taskSaved"), "success"); setOpen(false);
      if (start && result.blockId) router.push(`/focus?blockId=${result.blockId}`);
      else { router.replace(`/courses/${courseId}`); router.refresh(); }
    } catch { toast(t("study.taskError"), "error"); } finally { setPending(false); }
  }
  async function nextBatch() {
    if (pending) return;
    setPending(true);
    try {
      const result = await prepareMaterialTasks(fileId, language, true);
      if (!result.ok) { toast(t(result.error === "RATE_LIMITED" ? "flow.rateLimited" : "flow.prepareError"), "error"); return; }
      setDrafts(result.drafts); setSelected(result.drafts.items.map((item) => item.id));
    } catch { toast(t("flow.prepareError"), "error"); } finally { setPending(false); }
  }
  return <div className="mt-3 space-y-2">
    <QuickStudySetup courseId={courseId} fileId={fileId} title={filename} />
    <Button type="button" variant="secondary" className="w-full whitespace-normal" onClick={() => { setError(""); setOpen(true); }}>{t(outline ? "flow.reviewRecognizedPlan" : "flow.preparePlan")}</Button>
    <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}><DialogContent mobileSheet className={outline && !smallTasks ? "sm:max-w-xl" : ""}>
      <DialogTitle>{t(outline && !smallTasks ? "flow.reviewOutline" : "flow.reviewDrafts")}</DialogTitle><DialogDescription>{filename}</DialogDescription>
      {/* Document work starts only after explicitly opening preparation. Running
          it on every course visit queues timer starts behind PDF extraction. */}
      <MaterialRecognitionStatus fileId={fileId} analysis={analysis} onRecognized={onRecognized} />
      {!prepared && !error && <p role="status" className="py-6 text-sm">{t("flow.readingStructure")}</p>}
      {error && <div className="mt-4 space-y-3"><p role="alert" className="text-sm">{t(error === "NO_READABLE_TEXT" ? "flow.noText" : error === "RATE_LIMITED" ? "flow.rateLimited" : "flow.prepareError")}</p>
        <QuickStudySetup courseId={courseId} fileId={fileId} title={filename} />
      </div>}
      {prepared && outline && !smallTasks && <MaterialOutlineReview outline={outline} fileId={fileId} loadingTasks={pending} onTasks={() => void showSmallTasks()} onSaved={() => {
        toast(t("flow.outlineSaved"), "success"); setOpen(false); router.replace(`/courses/${courseId}`); router.refresh();
      }} />}
      {prepared && (!outline || smallTasks) && drafts && <>
        {outline && <Button type="button" variant="secondary" disabled={pending} onClick={() => setSmallTasks(false)}>{t("flow.reviewOutline")}</Button>}
        {!outline && <p className="mt-3 text-sm text-muted-foreground">{t("flow.noOutline")}</p>}
        <p className="mt-3 text-sm text-muted-foreground">{t(drafts.method === "ai" ? "flow.aiDrafts" : "flow.excerptDrafts")}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t("flow.draftScope")}</p>
        {drafts.nextCursor && <div className="mt-2"><Button type="button" variant="secondary" disabled={pending} onClick={() => void nextBatch()}>{pending ? t("flow.preparing") : t("flow.nextExcerpts")}</Button><p className="mt-1 text-xs text-muted-foreground">{t("flow.nextHint")}</p></div>}
        <ul className="mt-4 space-y-3">{drafts.items.map((item) => <li key={item.id} className="rounded-xl border border-border p-3">
          <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={selected.includes(item.id)} onChange={(event) => setSelected((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />
            <span className="min-w-0 break-words text-sm font-medium">{item.title}<span className="mt-1 block text-xs font-normal text-muted-foreground">{item.task.sourceRef} · {item.task.estimatedMinutes} min{item.topicId ? ` · ${t("flow.added")}` : ""}</span></span>
          </label>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.task.instruction}</p>
          <details className="mt-2"><summary className="flex min-h-11 cursor-pointer items-center text-sm text-brand-ink">{t("flow.preview")}</summary>
            <p className="mb-3 text-sm">{item.task.successCriteria}</p><p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-surface-muted p-3 text-sm">{item.task.sourceExcerpt}</p>
            {item.task.answerKey && <p className="mt-2 whitespace-pre-wrap text-sm">{t("study.answerKey")}: {item.task.answerKey}</p>}
          </details>
        </li>)}</ul>
        <div className="sticky bottom-0 mt-4 space-y-2 bg-surface pt-3">
          <Button className="w-full" type="button" disabled={pending || !selected.length} onClick={() => void accept(true)}>{pending ? t("study.saving") : t("flow.addStart")}</Button>
          <Button className="w-full" type="button" variant="secondary" disabled={pending || !selected.length} onClick={() => void accept(false)}>{t("flow.addPlan")}</Button>
        </div>
      </>}
    </DialogContent></Dialog>
  </div>;
}
