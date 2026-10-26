"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { quickStartStudy, studyMaterials, uploadMaterial } from "@/app/courses/studyActions";
import { UPLOAD_ACCEPT, isWithinUploadLimit } from "@/lib/fileText";
import type { StudyMode } from "@/lib/studyTask";
import { useLocale, useT } from "./i18n/I18nProvider";
import { useToast } from "./Toast";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

export default function QuickStudySetup({ courseId, topicId, title, fileId = "", label, initialOpen = false }: {
  courseId: string; topicId?: string; title?: string; fileId?: string; label?: string; initialOpen?: boolean;
}) {
  const t = useT(); const language = useLocale(); const router = useRouter(); const { toast } = useToast();
  const [open, setOpen] = useState(initialOpen);
  const [materials, setMaterials] = useState<{ id: string; filename: string }[]>([]);
  const [source, setSource] = useState(fileId);
  const [mode, setMode] = useState<StudyMode>("read");
  const [minutes, setMinutes] = useState(30);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void studyMaterials(courseId).then((files) => { if (active) setMaterials(files); }).catch(() => toast(t("flow.startError"), "error"));
    return () => { active = false; };
  }, [open, courseId, toast, t]);

  async function addFile(file?: File) {
    if (!file) return;
    if (!isWithinUploadLimit(file.size)) { toast(t("study.materialError"), "error"); return; }
    setLoading(true);
    try {
      const data = new FormData(); data.set("courseId", courseId); data.set("file", file);
      const result = await uploadMaterial(data);
      if (!result.ok || !result.id) throw new Error();
      setMaterials((files) => [{ id: result.id!, filename: file.name }, ...files]); setSource(result.id);
    } catch { toast(t("study.materialError"), "error"); } finally { setLoading(false); }
  }
  async function start(data: FormData) {
    if (pending) return;
    setPending(true);
    data.set("courseId", courseId); if (topicId) data.set("topicId", topicId);
    data.set("fileId", source); data.set("mode", mode); data.set("minutes", String(minutes)); data.set("language", language);
    try {
      const result = await quickStartStudy(data);
      if (!result.ok) { toast(t("flow.startError"), "error"); return; }
      router.push(`/focus?blockId=${result.blockId}`); router.refresh();
    } catch { toast(t("flow.startError"), "error"); } finally { setPending(false); }
  }
  return <>
    <Button type="button" className="w-full whitespace-normal" onClick={() => setOpen(true)}>{label ?? t("flow.quickStart")}</Button>
    <Dialog open={open} onOpenChange={(value) => !pending && !loading && setOpen(value)}>
      <DialogContent mobileSheet>
        <DialogTitle>{t("flow.quickStart")}</DialogTitle>
        <DialogDescription>{title ?? t("flow.quickHint")}</DialogDescription>
        <form action={start} className="mt-4 space-y-4">
          <fieldset><legend className="mb-2 text-sm font-medium">{t("flow.activity")}</legend>
            <div className="grid grid-cols-3 gap-2">{(["read", "solve", "recall"] as const).map((value) => <Button key={value} type="button" variant={mode === value ? "primary" : "secondary"} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`flow.${value}`)}</Button>)}</div>
          </fieldset>
          <label className="block text-sm font-medium">{t("study.sourceFile")}
            <Select value={source} onChange={(event) => setSource(event.target.value)} className="mt-1 w-full">
              <option value="">{t("flow.ownNotes")}</option>{materials.map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}
            </Select>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-ink underline">
            {loading ? t("study.saving") : t("courseDetail.addFile")}
            <input type="file" className="sr-only" accept={UPLOAD_ACCEPT} disabled={pending || loading} onChange={(event) => void addFile(event.target.files?.[0])} />
          </label>
          <fieldset><legend className="mb-2 text-sm font-medium">{t("flow.time")}</legend><div className="grid grid-cols-3 gap-2">{[15, 30, 45].map((value) => <Button type="button" key={value} aria-pressed={minutes === value} variant={minutes === value ? "primary" : "secondary"} onClick={() => setMinutes(value)}>{value} min</Button>)}</div></fieldset>
          <details><summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">{t("study.sourceRef")}</summary><Input name="sourceRef" maxLength={300} placeholder={t("study.sourceRefPlaceholder")} className="w-full" /></details>
          <Button type="submit" className="w-full" disabled={pending || loading}>{pending ? t("study.saving") : t("flow.start")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
