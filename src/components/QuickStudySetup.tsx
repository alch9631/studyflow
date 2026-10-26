"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { quickStartStudy, prepareQuickStudySetup, uploadMaterial, previewQuickStudySource } from "@/app/courses/studyActions";
import { UPLOAD_ACCEPT, isWithinUploadLimit } from "@/lib/fileText";
import type { StudyMode } from "@/lib/studyTask";
import { useLocale, useT } from "./i18n/I18nProvider";
import { useToast } from "./Toast";
import { Button } from "./ui/button";
import { Select } from "./ui/select";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

type SourcePreview = { fileId: string; requestedCursor?: number; cursor: number; nextCursor: number | null;
  sections: { reference: string; text: string }[]; reason: "matched" | "choose" | "continue"; failed?: boolean };

export default function QuickStudySetup({ courseId, topicId, title, fileId = "", label, initialOpen = false }: {
  courseId: string; topicId?: string; title?: string; fileId?: string; label?: string; initialOpen?: boolean;
}) {
  const t = useT();
  const language = useLocale();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(initialOpen);
  const [materials, setMaterials] = useState<{ id: string; filename: string }[]>([]);
  const [source, setSource] = useState(fileId);
  const [mode, setMode] = useState<StudyMode>("read");
  const [minutes, setMinutes] = useState(30);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cursor, setCursor] = useState<number>();
  const [previous, setPrevious] = useState<(number | undefined)[]>([]);
  const [preview, setPreview] = useState<SourcePreview | null>(null);
  const [reference, setReference] = useState("");
  const [opening, setOpening] = useState(0);
  const [loadedSetup, setLoadedSetup] = useState("");
  const setupKey = `${courseId}:${topicId ?? ""}:${fileId}:${opening}`;
  const loadingMaterials = loadedSetup !== setupKey;
  const loadingSource = !!source && (!preview || preview.fileId !== source || preview.requestedCursor !== cursor);
  const section = preview?.sections.find((item) => item.reference === reference);

  useEffect(() => {
    if (!open || !loadingMaterials) return;
    let active = true;
    void prepareQuickStudySetup(courseId, topicId, fileId).then((result) => { if (active) {
      setMaterials(result.files); setSource(result.sourceId); setCursor(undefined); setPrevious([]);
      setPreview(result.sourceId ? result.preview?.ok ? { ...result.preview, fileId: result.sourceId }
        : { fileId: result.sourceId, cursor: 1, nextCursor: null, sections: [], reason: "choose", failed: true } : null);
      setReference(result.preview?.ok ? result.preview.suggested ?? "" : "");
      setLoadedSetup(setupKey);
    } }).catch(() => { if (active) { setLoadedSetup(setupKey); toast(t("flow.startError"), "error"); } });
    return () => { active = false; };
  }, [open, loadingMaterials, setupKey, courseId, topicId, fileId, toast, t]);

  useEffect(() => {
    if (!open || !source || loadingMaterials || preview?.fileId === source && preview.requestedCursor === cursor) return;
    let active = true;
    void previewQuickStudySource(courseId, source, topicId, cursor).then((result) => {
      if (!active) return;
      setPreview(result.ok ? { ...result, fileId: source, requestedCursor: cursor }
        : { fileId: source, requestedCursor: cursor, cursor: cursor ?? 1, nextCursor: null, sections: [], reason: "choose", failed: true });
      setReference(result.ok ? result.suggested ?? "" : "");
    }).catch(() => {
      if (active) setPreview({ fileId: source, requestedCursor: cursor, cursor: cursor ?? 1, nextCursor: null, sections: [], reason: "choose", failed: true });
    });
    return () => { active = false; };
  }, [open, source, courseId, topicId, cursor, loadingMaterials, preview]);

  function chooseSource(value: string) {
    setSource(value); setCursor(undefined); setPrevious([]); setReference(""); setPreview(null);
  }
  async function addFile(file?: File) {
    if (!file) return;
    if (!isWithinUploadLimit(file.size)) { toast(t("study.materialError"), "error"); return; }
    setUploading(true);
    try {
      const data = new FormData(); data.set("courseId", courseId); data.set("file", file);
      const result = await uploadMaterial(data);
      if (!result.ok || !result.id) throw new Error();
      setMaterials((files) => [{ id: result.id!, filename: file.name }, ...files]); chooseSource(result.id);
    } catch { toast(t("study.materialError"), "error"); } finally { setUploading(false); }
  }
  async function start(data: FormData) {
    if (pending || loadingMaterials || loadingSource) return;
    setPending(true);
    data.set("courseId", courseId);
    if (topicId) data.set("topicId", topicId);
    data.set("fileId", source); data.set("mode", mode); data.set("minutes", String(minutes)); data.set("language", language);
    data.set("sourceRef", reference);
    if (source && preview) data.set("sourceCursor", String(preview.cursor));
    try {
      const result = await quickStartStudy(data);
      if (!result.ok) { toast(t("flow.startError"), "error"); return; }
      router.push(`/focus?blockId=${result.blockId}`);
    } catch { toast(t("flow.startError"), "error"); } finally { setPending(false); }
  }
  return <>
    <Button type="button" className="w-full whitespace-normal" onClick={() => { setOpening((value) => value + 1); setOpen(true); }}>{label ?? t("flow.quickStart")}</Button>
    <Dialog open={open} onOpenChange={(value) => !pending && !uploading && setOpen(value)}>
      <DialogContent mobileSheet>
        <DialogTitle>{t("flow.quickStart")}</DialogTitle>
        <DialogDescription className={title ? undefined : "sr-only"}>{title ?? t("flow.quickHint")}</DialogDescription>
        <form action={start} className="mt-4 space-y-4">
          <label className="block text-sm font-medium">{t("study.sourceFile")}
            <Select value={source} onChange={(event) => chooseSource(event.target.value)} className="mt-1 w-full" disabled={pending || uploading || loadingMaterials}>
              <option value="">{t("flow.ownNotes")}</option>{materials.map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}
            </Select>
          </label>
          <label className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand-ink underline">
            {uploading ? t("flow.recognizingUpload") : t("courseDetail.addFile")}
            <input type="file" className="sr-only" accept={UPLOAD_ACCEPT} disabled={pending || uploading || loadingMaterials} onChange={(event) => void addFile(event.target.files?.[0])} />
          </label>
          {loadingMaterials || loadingSource ? <p role="status" className="text-sm">{t("flow.loadingSource")}</p> : source && preview && preview.sections.length > 0 ? <div className="space-y-3">
            <label className="block text-sm font-medium">{t("flow.exactSection")}
              <Select value={reference} required onChange={(event) => setReference(event.target.value)} className="mt-1 w-full" disabled={pending}>
                <option value="">{t("flow.chooseSection")}</option>{preview.sections.map((item) => <option key={item.reference} value={item.reference}>{item.reference} · {item.text.split("\n")[0].slice(0, 90)}</option>)}
              </Select>
            </label>
            {section && <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-muted-foreground">{t("flow.sourceExcerpt")}</summary><div className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words py-2 text-sm leading-relaxed">{section.text}</div>
              <a href={`/api/materials/${encodeURIComponent(source)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink underline">{t("study.openMaterial")}</a></details>}
            <div className="flex flex-wrap gap-2">
              {previous.length > 0 && <Button type="button" variant="secondary" disabled={pending} onClick={() => { setCursor(previous.at(-1)); setPrevious((items) => items.slice(0, -1)); }}>{t("flow.previousSections")}</Button>}
              {preview.nextCursor && <Button type="button" variant="secondary" disabled={pending} onClick={() => { setPrevious((items) => [...items, cursor]); setCursor(preview.nextCursor!); }}>{t("flow.nextExcerpts")}</Button>}
            </div>
          </div> : <label className="block text-sm font-medium">{t("flow.exactSection")}
            {source && <p className="my-2 text-sm text-muted-foreground">{t(preview?.failed ? "flow.sourcePreviewFailed" : "flow.noText")}</p>}
            <Input required value={reference} onChange={(event) => setReference(event.target.value)} maxLength={300} placeholder={t("study.sourceRefPlaceholder")} className="mt-1 w-full" />
          </label>}
          {!loadingMaterials && !loadingSource && source && !preview?.sections.length && <a href={`/api/materials/${encodeURIComponent(source)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-ink underline">{t("study.openMaterial")}</a>}
          <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{minutes} min · {t(`flow.${mode}`)}</summary>
          <fieldset className="mt-2"><legend className="mb-2 text-sm font-medium">{t("flow.time")}</legend><div className="grid grid-cols-3 gap-2">{[15, 30, 45].map((value) => <Button type="button" key={value} aria-pressed={minutes === value} variant={minutes === value ? "primary" : "secondary"} onClick={() => setMinutes(value)}>{value} min</Button>)}</div></fieldset>
          <fieldset><legend className="mb-2 text-sm font-medium">{t("flow.activity")}</legend>
            <div className="grid grid-cols-3 gap-2">{(["read", "solve", "recall"] as const).map((value) => <Button key={value} type="button" variant={mode === value ? "primary" : "secondary"} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(`flow.${value}`)}</Button>)}</div>
          </fieldset>
          </details>
          <Button type="submit" className="w-full" disabled={pending || uploading || loadingMaterials || loadingSource || !reference.trim()}>{pending ? t("flow.starting") : t("flow.start")}</Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
