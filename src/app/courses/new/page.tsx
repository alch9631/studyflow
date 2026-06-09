import type { Metadata } from "next";
import Link from "next/link";
import NewCourseForm from "./NewCourseForm";

export const metadata: Metadata = {
  title: "New course",
  description: "Add a module and its exam date — StudyFlow builds the study plan for you.",
};

export default function NewCoursePage() {
  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <span aria-hidden="true">←</span> My Courses
      </Link>
      <h1 className="mb-3 mt-2 text-2xl font-bold">New course</h1>

      {/* Shortcut: pick from the official TUHH catalog instead of typing it all
          out. Kept as a link (not an inline list) so the form stays short on mobile. */}
      <Link
        href="/catalog"
        className="mb-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm transition-colors hover:border-brand hover:bg-blue-50/50 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand dark:hover:bg-blue-950/30"
      >
        <span aria-hidden="true" className="text-xl">🎓</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-gray-800 dark:text-gray-100">
            Studying at TUHH?
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            Pick from the official module catalog instead of typing it in.
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-gray-400">→</span>
      </Link>

      <NewCourseForm />
    </main>
  );
}
