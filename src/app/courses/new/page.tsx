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
        href="/catalog"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <span aria-hidden="true">←</span> Modules
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">Add a course manually</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Not in the module catalog? Enter it by hand.
      </p>

      <NewCourseForm />
    </main>
  );
}
