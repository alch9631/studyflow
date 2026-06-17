"use client";

import { useRef, useState } from "react";
import { analyzeModuleUpload } from "../courses/actions";
import { FILE_CATEGORIES } from "@/lib/fileCategory";

const DOC_TYPE_LABEL: Record<string, string> = {
  skript: "Lecture script",
  slides: "Slides",
  uebung: "Exercise sheet",
  altklausur: "Past exam",
  mockexam: "Mock exam",
};

/**
 * Drag-and-drop syllabus/slides upload target for the desktop dashboard.
 *
 * Posts to the existing {@link analyzeModuleUpload} server action — so it runs
 * the real AI analysis pipeline (extract → topics) for the chosen course. That
 * action *replaces* the course's topics from the file, hence the inline note.
 */
export default function UploadDropzone({
  courses,
}: {
  courses: { id: string; name: string }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);

  const setFile = (files: FileList | null) => {
    if (files && files.length > 0 && inputRef.current) {
      inputRef.current.files = files;
      setFilename(files[0].name);
    }
  };

  return (
    <form action={analyzeModuleUpload} className="flex flex-col gap-3">
      <select
        name="courseId"
        required
        defaultValue={courses[0]?.id ?? ""}
        className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
      >
        {courses.length === 0 && <option value="">No courses yet</option>}
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          setFile(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-3 py-6 text-center transition-colors ${
          over
            ? "border-indigo-400 bg-indigo-500/10"
            : "border-slate-700 bg-slate-900/60 hover:border-slate-600"
        }`}
      >
        <span className="text-2xl">📄</span>
        <span className="text-sm font-medium text-slate-200">
          {filename ?? "Drop syllabus or slides"}
        </span>
        <span className="text-xs text-slate-500">
          {filename ? "Ready to analyze" : "or click to browse — PDF / DOCX"}
        </span>
        <input
          ref={inputRef}
          type="file"
          name="file"
          accept=".pdf,.docx,.doc,.txt"
          className="hidden"
          onChange={(e) => setFile(e.target.files)}
        />
      </div>

      <select
        name="docType"
        defaultValue="skript"
        className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
      >
        {FILE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {DOC_TYPE_LABEL[c] ?? c}
          </option>
        ))}
      </select>

      <button
        type="submit"
        disabled={courses.length === 0}
        className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Analyze & build topics
      </button>
      <p className="text-[11px] leading-snug text-slate-500">
        Runs AI analysis and replaces this course&rsquo;s topics from the file.
      </p>
    </form>
  );
}
