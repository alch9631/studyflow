import type { Metadata } from "next";
import Link from "next/link";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getT } from "@/components/i18n/server";

export const metadata: Metadata = {
  title: "Offline",
  description: "You're offline. StudyFlow will sync the latest once you're back online.",
};

export default async function OfflinePage() {
  const t = await getT();
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <WifiOff className="h-10 w-10 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      <h1 className="text-2xl font-bold">{t("offline.title")}</h1>
      <p className="text-gray-500 dark:text-gray-400">
        {t("offline.body")}
      </p>
      <Button asChild className="mt-2">
        <Link href="/today">{t("offline.retry")}</Link>
      </Button>
    </main>
  );
}
