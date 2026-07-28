"use client";

import { useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { buttonClasses } from "./ui";
import { useT } from "./i18n/I18nProvider";
import { UPLOAD_ACCEPT, MAX_UPLOAD_LABEL, isWithinUploadLimit } from "@/lib/fileText";

/**
 * Upload box. Uses a <label>-wrapped input (native click association) rather than
 * a JS-triggered hidden input — the latter fails to open the picker on iOS Safari.
 * The input is visually hidden with sr-only (still rendered, so the label works).
 *
 * Oversized files are caught HERE rather than server-side: a body past
 * `serverActions.bodySizeLimit` is rejected by the framework before our action
 * runs, so there is no redirect and no banner to show — the user would just get
 * a raw error page after waiting out a long upload. We reject it instantly, name
 * the limit, and clear the input so the form can't submit a file we know is
 * too big.
 */
export default function FilePicker({ disabled }: { disabled?: boolean }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const t = useT();

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file && !isWithinUploadLimit(file.size)) {
      setError(t("courseDetail.fileTooLarge", { size: MAX_UPLOAD_LABEL }));
      setName("");
      e.target.value = "";
      return;
    }
    setError("");
    setName(file?.name ?? "");
  }

  return (
    <div className="space-y-2">
      <label
        className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          error ? "border-red-400 dark:border-red-500" : "border-gray-300 dark:border-gray-700"
        } ${disabled ? "opacity-50" : "cursor-pointer hover:border-brand"}`}
      >
        <input
          type="file"
          name="file"
          accept={UPLOAD_ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={onPick}
        />
        <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
          {name ? (
            <>
              <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
              {name}
            </>
          ) : (
            t("courseDetail.filePrompt")
          )}
        </span>
        <span className={buttonClasses("primary", "md")}>
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          {name ? t("courseDetail.fileChooseDifferent") : t("courseDetail.fileChoose")}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
