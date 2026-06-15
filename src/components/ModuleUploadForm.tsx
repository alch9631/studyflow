"use client";

import { useState } from "react";
import { buttonClasses } from "./ui";
import { Select } from "./ui/select";
import SubmitButton from "./SubmitButton";
import { useT } from "./i18n/I18nProvider";
import {
  FILE_CATEGORIES,
  categorizeByFilename,
  type FileCategory,
} from "@/lib/fileCategory";
import { analyzeModuleUpload } from "@/app/courses/actions";

/**
 * Upload box + explicit document-type picker for the course page (Feature 2).
 *
 * The user chooses the file AND its type. Picking a file auto-detects a type
 * from the filename (the same pure heuristic the server uses) and PRE-SELECTS it
 * as the default — but the user can override it. Only when the user has manually
 * changed the type do we stop tracking the filename so we don't clobber their
 * choice. The chosen type submits as `docType` and the server uses it both to
 * shape the AI topic generation and as the stored category.
 *
 * Kept as one client island wrapping the native file input + native <select> so
 * the whole thing still submits via the server action's FormData.
 *
 * `collapsible` (used inside the course page's compact "Materials" disclosure)
 * hides the full uploader behind a small "+ Add file" trigger so the box takes
 * almost no room until the user actually wants to upload.
 */
export default function ModuleUploadForm({
  courseId,
  collapsible = false,
}: {
  courseId: string;
  collapsible?: boolean;
}) {
  const t = useT();
  const [name, setName] = useState("");
  // The currently-selected type. "" until a file is picked / user chooses.
  const [docType, setDocType] = useState<FileCategory | "">("");
  // Once the user manually edits the select we stop auto-overwriting it.
  const [userPicked, setUserPicked] = useState(false);
  // When collapsible, the form stays hidden behind a small trigger until opened.
  const [open, setOpen] = useState(false);

  function onFile(file: File | undefined) {
    setName(file?.name ?? "");
    if (!userPicked) {
      // Pre-select the auto-detected category (falls back to "sonstiges" so the
      // control always has a concrete default the server can read).
      setDocType(file ? categorizeByFilename(file.name) ?? "sonstiges" : "");
    }
  }

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className={buttonClasses("secondary", "sm")}
      >
        <span aria-hidden="true">＋</span> {t("courseDetail.addFile")}
      </button>
    );
  }

  return (
    <form action={analyzeModuleUpload} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />

      <label
        className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-brand dark:border-gray-700"
      >
        <input
          type="file"
          name="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {name ? `📄 ${name}` : t("courseDetail.filePrompt")}
        </span>
        <span className={buttonClasses("primary", "md")}>
          📎 {name ? t("courseDetail.fileChooseDifferent") : t("courseDetail.fileChoose")}
        </span>
      </label>

      <div className="space-y-1">
        <label
          htmlFor="module-doc-type"
          className="block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          {t("courseDetail.docType.label")}
        </label>
        <Select
          id="module-doc-type"
          name="docType"
          value={docType}
          onChange={(e) => {
            setDocType(e.target.value as FileCategory | "");
            setUserPicked(true);
          }}
        >
          {FILE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`courseDetail.fileCategory.${c}`)}
            </option>
          ))}
        </Select>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("courseDetail.docType.hint")}
        </p>
      </div>

      <SubmitButton
        variant="primary"
        size="md"
        className="w-full sm:w-auto"
        pendingLabel={t("courseDetail.analyzing")}
      >
        {t("courseDetail.analyzeFile")}
      </SubmitButton>
    </form>
  );
}
