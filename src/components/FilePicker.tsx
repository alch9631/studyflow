"use client";

import { useState } from "react";

/**
 * Upload box. Uses a <label>-wrapped input (native click association) rather than
 * a JS-triggered hidden input — the latter fails to open the picker on iOS Safari.
 * The input is visually hidden with sr-only (still rendered, so the label works).
 */
export default function FilePicker({ disabled }: { disabled?: boolean }) {
  const [name, setName] = useState("");

  return (
    <label
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 p-6 text-center ${
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
      <span className="text-sm text-gray-500">
        {name ? `📄 ${name}` : "Tap to choose a file from Files — PDF, TXT, or MD"}
      </span>
      <span className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white">
        📎 {name ? "Choose a different file" : "Choose file"}
      </span>
    </label>
  );
}
