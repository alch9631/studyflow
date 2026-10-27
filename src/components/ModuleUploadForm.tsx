"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { Paperclip, Plus } from "lucide-react";
import { Button } from "./ui/button";
import SubmitButton from "./SubmitButton";
import { useT } from "./i18n/I18nProvider";
import { categorizeByFilename } from "@/lib/fileCategory";
import { uploadMaterial } from "@/app/courses/studyActions";
import ValidatedForm from "./ValidatedForm";
import { UPLOAD_ACCEPT, MAX_UPLOAD_LABEL, isWithinUploadLimit } from "@/lib/fileText";

/** Store a file. Task preparation is a separate, optional action on its row. */
export default function ModuleUploadForm({ courseId, collapsible = false }: {
  courseId: string; collapsible?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  if (collapsible && !open) return <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)} aria-expanded={false}>
    <Plus className="h-4 w-4" aria-hidden="true" />{t("courseDetail.addFile")}
  </Button>;

  return <ValidatedForm action={uploadMaterial} successMessage={t("study.materialSaved")} errorMessage={t("study.materialError")} onDone={() => {
    setName(""); setOpen(false);
    router.replace(`/courses/${courseId}?materials=1#materials`, { scroll: false });
    router.refresh();
  }} className="space-y-3">
    <UploadFields>
    <input type="hidden" name="courseId" value={courseId} />
    <input type="hidden" name="docType" value={categorizeByFilename(name) ?? "sonstiges"} />
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-input px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-brand">
      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{name || t("courseDetail.fileChoose")}</span>
      <input type="file" required name="file" accept={UPLOAD_ACCEPT} aria-label={t("courseDetail.fileChoose")} className="sr-only" onChange={(event) => {
        const file = event.target.files?.[0];
        if (file && !isWithinUploadLimit(file.size)) {
          setError(t("courseDetail.fileTooLarge", { size: MAX_UPLOAD_LABEL }));
          setName(""); event.target.value = ""; return;
        }
        setError(""); setName(file?.name ?? "");
      }} />
    </label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap items-center gap-3">
      <SubmitButton variant="primary" size="sm" disabled={!name} pendingLabel={t("common.saving")}>{t("flow.uploadFile")}</SubmitButton>
      {collapsible && <Button type="button" variant="ghost" size="sm" onClick={() => { setOpen(false); setName(""); setError(""); }}>{t("common.cancel")}</Button>}
    </div>
    </UploadFields>
  </ValidatedForm>;
}

function UploadFields({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return <fieldset disabled={pending} className="min-w-0 space-y-3">{children}</fieldset>;
}
