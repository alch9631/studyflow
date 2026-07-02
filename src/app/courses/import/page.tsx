import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isSyllabusAIEnabled } from "@/lib/syllabus";
import ImportForm from "./ImportForm";
import PageToast from "../[id]/PageToast";
import { getT } from "@/components/i18n/server";
import type { MessageKey } from "@/components/i18n/messages";

// Render per-request so the AI-key gating reflects the current env (not build time).
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Import course",
  description: "Turn a syllabus or module handbook into a ready-made course and study plan.",
};

// Server-reject banners `importSyllabus` can bounce back with (allowlist so a
// tampered ?msg can never reach t() with an arbitrary key).
const BANNER_KEYS = new Set(["import-empty", "rate-limited"]);

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const { msg } = await searchParams;
  const enabled = isSyllabusAIEnabled();
  const isDev = process.env.NODE_ENV !== "production";

  // In production with AI off, don't present a disabled screen as a product flow:
  // the manual add path still works, so send the user there. The disabled screen
  // (with its env-var setup note) is a development affordance only.
  if (!enabled && !isDev) {
    redirect("/courses/new");
  }

  const t = await getT();
  const banner =
    msg && BANNER_KEYS.has(msg) ? t(`importCourse.banners.${msg}` as MessageKey) : undefined;

  return (
    <main className="mx-auto max-w-xl p-4 sm:p-8">
      {banner && <PageToast message={banner} variant="error" />}
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t("importCourse.back")}
      </Link>
      <h1 className="mb-1 mt-2 text-2xl font-bold">{t("importCourse.title")}</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        {t("importCourse.subtitlePre")}<em>{t("importCourse.subtitleOr")}</em>{t("importCourse.subtitlePost")}
      </p>

      {!enabled && isDev && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t("importCourse.aiOffPre")}<code>OPENAI_API_KEY</code>{t("importCourse.aiOffMid")}
          <code>ANTHROPIC_API_KEY</code>{t("importCourse.aiOffEnv")}
          <code>.env</code>{t("importCourse.aiOffPost")}
        </div>
      )}

      <ImportForm enabled={enabled} />
    </main>
  );
}
