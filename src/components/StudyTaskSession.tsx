"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finishStudyTask } from "@/app/courses/studyActions";
import { taskSourceHref, type StudyTask } from "@/lib/studyTask";
import { useT } from "./i18n/I18nProvider";
import { useToast } from "./Toast";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import QuickStudySetup from "./QuickStudySetup";

export default function StudyTaskSession({ blockId, courseId, topicId, task, fileAvailable, actualMinutes, open, onOpenChange,
  response: controlledResponse, onResponseChange, onCompleted, hideCheckButton = false }: {
  blockId: string; courseId: string; topicId: string; task: StudyTask | null;
  fileAvailable: boolean; actualMinutes: number; open: boolean; onOpenChange: (value: boolean) => void;
  response?: string; onResponseChange?: (value: string) => void; onCompleted?: () => void; hideCheckButton?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const [localResponse, setLocalResponse] = useState("");
  const response = controlledResponse ?? localResponse;
  const setResponse = onResponseChange ?? setLocalResponse;
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const source = task && taskSourceHref(task, fileAvailable);

  async function finish(outcome: "complete" | "practice") {
    if (pending) return;
    setPending(true);
    const data = new FormData();
    data.set("blockId", blockId); data.set("topicId", topicId); data.set("outcome", outcome); data.set("response", response);
    data.set("checked", outcome === "complete" ? "1" : "0"); data.set("actualMinutes", String(Math.min(600, Math.max(0, actualMinutes))));
    try {
      const result = await finishStudyTask(data);
      if (!result.ok) { toast(t("study.resultError"), "error"); return; }
      sessionStorage.removeItem("sf-focus-session");
      onCompleted?.();
      toast(t("study.resultSaved"), "success");
      router.push("/today");
    } catch { toast(t("study.resultError"), "error"); }
    finally { setPending(false); }
  }

  if (!task) return <div className="mt-6 rounded-xl bg-surface-muted p-4 text-left text-sm">
    <p>{t("study.unconfigured")}</p>
    <div className="mt-3"><QuickStudySetup courseId={courseId} topicId={topicId} /></div>
  </div>;

  return <>
    <section className="mt-6 text-left">
      <p className="whitespace-pre-wrap break-words text-lg leading-relaxed">{task.instruction}</p>
      {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block min-h-11 max-w-full break-words py-3 text-sm font-semibold text-brand-ink underline underline-offset-4 [overflow-wrap:anywhere]">{t("study.openMaterial")}{task.sourceRef && <> · {task.sourceRef}</>}</a>
        : task.sourceRef && <p className="mt-3 break-words text-sm text-muted-foreground">{task.sourceRef}</p>}
      {task.sourceFileId && !fileAvailable && !source && <p className="mt-2 text-sm text-muted-foreground">{t("study.originalUnavailable")}</p>}
      {task.sourceExcerpt && <details className="mt-2">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t("flow.sourceExcerpt")}</summary>
        <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words py-2 text-base leading-relaxed">{task.sourceExcerpt}</div>
      </details>}
      {!hideCheckButton && <Button type="button" variant="secondary" className="mt-4 w-full" onClick={() => onOpenChange(true)}>{t("study.checkResult")}</Button>}
    </section>
    <Dialog open={open} onOpenChange={(value) => !pending && onOpenChange(value)}>
      <DialogContent mobileSheet showCloseButton={!pending}>
        <DialogTitle>{t("study.checkResult")}</DialogTitle>
        <DialogDescription>{task.successCriteria}</DialogDescription>
        {task.checkQuestion && <p className="mt-4 whitespace-pre-wrap break-words font-medium">{task.checkQuestion}</p>}
        {task.checkQuestion ? <label className="mt-4 block text-sm font-medium">
          {t("study.response")}<Textarea rows={3} maxLength={4000} value={response} onChange={(event) => setResponse(event.target.value)}
            placeholder={t("study.responsePlaceholder")} className="mt-1 w-full" />
        </label> : <details className="mt-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm">{t("flow.optionalResult")}</summary>
          <Textarea aria-label={t("study.response")} maxLength={4000} rows={3} value={response} onChange={(event) => setResponse(event.target.value)} />
        </details>}
        {task.answerKey && (!revealed ? <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setRevealed(true)} disabled={!response.trim()}>{t("study.showAnswer")}</Button>
          : <div className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-3 text-sm"><strong>{t("study.answerKey")}</strong><p className="mt-2">{task.answerKey}</p></div>)}
        {source && <a href={source} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center text-sm text-brand-ink underline">{t("study.openMaterial")}</a>}
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" onClick={() => void finish("complete")} disabled={pending || (!!task.answerKey && !revealed) || (!!task.checkQuestion && !response.trim())}>{pending ? t("study.saving") : t("study.finish")}</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => void finish("practice")}>{t("study.needsPractice")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
