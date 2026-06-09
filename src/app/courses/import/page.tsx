import type { Metadata } from "next";
import Link from "next/link";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import ImportForm from "./ImportForm";

// Render per-request so the AI-key gating reflects the current env (not build time).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Import course",
  description: "Turn a syllabus or module handbook into a ready-made course and study plan.",
};

export default function ImportPage() {
  const enabled = isSyllabusAIEnabled();

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <span aria-hidden="true">←</span> My Courses
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Import from material ✨</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Paste a syllabus <em>or</em> upload a lecture script / study material
        (PDF, txt, md) — AI pulls out the topics and exam date, then builds a
        realistic plan.
      </p>

      {!enabled && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠️ AI import is off — set <code>OPENAI_API_KEY</code> or{" "}
          <code>ANTHROPIC_API_KEY</code> in your{" "}
          <code>.env</code> to enable it. You can still add courses manually.
        </div>
      )}

      <ImportForm enabled={enabled} />
    </main>
  );
}
