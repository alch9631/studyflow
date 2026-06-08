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
      <Link href="/courses" className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← My Courses
      </Link>
      <h1 className="mb-6 mt-2 text-2xl font-bold">New course</h1>

      <NewCourseForm />
    </main>
  );
}
