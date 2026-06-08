import Link from "next/link";
import NewCourseForm from "./NewCourseForm";

export const metadata = { title: "New course" };

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
