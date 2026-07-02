import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import NewCourseForm from "./NewCourseForm";
import PageToast from "../[id]/PageToast";
import { getT } from "@/components/i18n/server";
import type { MessageKey } from "@/components/i18n/messages";

export const metadata: Metadata = {
  title: "New course",
  description: "Add a module and its exam date, and StudyFlow builds the study plan for you.",
};

// Server-reject banners `createCourse` can bounce back with (allowlist so a
// tampered ?msg can never reach t() with an arbitrary key).
const BANNER_KEYS = new Set(["exam-past", "exam-too-far"]);

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const t = await getT();
  const banner = msg && BANNER_KEYS.has(msg) ? t(`newCourse.banners.${msg}` as MessageKey) : undefined;
  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      {banner && <PageToast message={banner} variant="error" />}
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("newCourse.back")}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">{t("newCourse.title")}</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {t("newCourse.subtitle")}
      </p>

      <NewCourseForm />
    </main>
  );
}
