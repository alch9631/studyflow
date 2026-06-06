"use client";

import { useRef, useState } from "react";

/** Styled upload box: a dashed drop-zone with a button that opens the file dialog. */
export default function FilePicker({ disabled }: { disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");

  return (
    <div
      className={`rounded-xl border-2 border-dashed border-gray-300 p-6 text-center ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {/* The real input is hidden; the button below opens it. name="file" so the form action receives it. */}
      <input
        ref={ref}
        type="file"
        name="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain"
        disabled={disabled}
        className="hidden"
        onChange={(e) => setName(e.target.files?.[0]?.name ?? "")}
      />
      <p className="mb-3 text-sm text-gray-500">
        {name ? `📄 ${name}` : "Drop in a lecture script or syllabus — PDF, TXT, or MD"}
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="rounded-full bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-40"
      >
        📎 {name ? "Choose a different file" : "Choose file"}
      </button>
    </div>
  );
}
