"use client";

import { useState } from "react";
import { buttonClasses } from "./ui";
import { useT } from "./i18n/I18nProvider";

/**
 * Upload box. Uses a <label>-wrapped input (native click association) rather than
 * a JS-triggered hidden input — the latter fails to open the picker on iOS Safari.
 * The input is visually hidden with sr-only (still rendered, so the label works).
 */
export default function FilePicker({ disabled }: { disabled?: boolean }) {
  const [name, setName] = useState("");
  const t = useT();

  return (
    <label
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-6 text-center transition-colors ${
        disabled ? "opacity-50" : "cursor-pointer hover:border-brand"
      }`}
    >
      <input
        type="file"
        name="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        disabled={disabled}
        className="sr-only"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? "")}
      />
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {name ? `📄 ${name}` : t("courseDetail.filePrompt")}
      </span>
      <span className={buttonClasses("primary", "md")}>
        📎 {name ? t("courseDetail.fileChooseDifferent") : t("courseDetail.fileChoose")}
      </span>
    </label>
  );
}
