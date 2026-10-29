"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Paperclip, X } from "lucide-react";
import { Button } from "./ui/button";
import { iconButtonClass } from "./ui";
import { useT } from "./i18n/I18nProvider";
import { useToast } from "./Toast";
import { uploadMaterial } from "@/app/courses/studyActions";
import { uploadMaterialFiles, type MaterialUploadFailure } from "@/lib/materialUploadQueue";
import { UPLOAD_ACCEPT, MAX_UPLOAD_LABEL } from "@/lib/fileText";

/** Store a file. Task preparation is a separate, optional action on its row. */
export default function ModuleUploadForm({ courseId }: { courseId: string }) {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [files, setFiles] = useState<File[]>([]);
  const [failed, setFailed] = useState<MaterialUploadFailure[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  async function uploadSelected() {
    if (inFlight.current || !files.length) return;
    inFlight.current = true;
    setFailed([]);
    try {
      const result = await uploadMaterialFiles(courseId, files, uploadMaterial,
        (current, total) => setProgress({ current, total }));
      // Keep only failed originals in memory: Retry must never re-upload successes.
      setFiles(result.failed.map(({ file }) => file));
      setFailed(result.failed);
      if (input.current) input.current.value = "";
      if (result.saved) {
        toast(result.saved === 1 ? t("courseDetail.fileSaved") : t("courseDetail.filesSaved", { count: result.saved }));
        router.replace(`/courses/${courseId}?materials=1#materials`, { scroll: false });
        router.refresh();
      }
    } finally {
      inFlight.current = false;
      setProgress(null);
    }
  }

  return <form onSubmit={(event) => { event.preventDefault(); void uploadSelected(); }} data-material-upload>
    <fieldset disabled={!!progress} className="flex min-w-0 flex-wrap items-center gap-2">
    <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl border border-input px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-brand">
      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{files.length > 1 ? t("courseDetail.filesSelected", { count: files.length }) : files[0]?.name || t("courseDetail.addFiles")}</span>
      <input ref={input} type="file" multiple name="files" accept={UPLOAD_ACCEPT} aria-label={t("courseDetail.chooseFiles")} className="sr-only" onChange={(event) => {
        const selected = Array.from(event.target.files ?? []);
        if (!selected.length) return;
        setFiles(selected); setFailed([]);
      }} />
    </label>
    {!!files.length && <Button type="submit" variant="primary" size="sm" className="min-h-11 shrink-0" aria-busy={!!progress}>
      {progress && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
      <span aria-live="polite" aria-atomic="true">{progress ? t("courseDetail.uploadProgress", progress) : failed.length ? t("common.retry") : t("flow.uploadFile")}</span>
    </Button>}
    {!!failed.length && <ul role="alert" className="w-full text-sm text-destructive">
      {failed.map(({ file, reason }, index) => <li key={index} className="flex min-w-0 items-start gap-2">
        <span className="min-w-0 flex-1 py-2 [overflow-wrap:anywhere]">{file.name}: {reason === "size" ? t("courseDetail.fileSizeError", { size: MAX_UPLOAD_LABEL }) : reason === "type" ? t("courseDetail.fileTypeError") : t("courseDetail.fileUploadError")}</span>
        <button type="button" className={iconButtonClass("inline-flex shrink-0")} aria-label={t("courseDetail.removeSelectedFile", { name: file.name })} onClick={() => {
          setFiles((current) => current.filter((item) => item !== file));
          setFailed((current) => current.filter((item) => item.file !== file));
        }}><X className="h-4 w-4" aria-hidden="true" /></button>
      </li>)}
    </ul>}
    </fieldset>
  </form>;
}
