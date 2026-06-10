import type { Metadata } from "next";
import Link from "next/link";
import NewCourseForm from "./NewCourseForm";
import { getT } from "@/components/i18n/server";

export const metadata: Metadata = {
  title: "New course",
  description: "Add a module and its exam date — StudyFlow builds the study plan for you.",
};

export default async function NewCoursePage() {
  const t = await getT();
  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <span aria-hidden="true">←</span> {t("newCourse.back")}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">{t("newCourse.title")}</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {t("newCourse.subtitle")}
      </p>

      <NewCourseForm />
    </main>
  );
}
