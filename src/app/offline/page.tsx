import Link from "next/link";
import { buttonClasses } from "@/components/ui";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">📶</p>
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="text-gray-500 dark:text-gray-400">
        StudyFlow can&apos;t reach the network right now. Pages you&apos;ve already
        opened may still work — reconnect to sync the latest.
      </p>
      <Link href="/today" className={buttonClasses("primary", "md", "mt-2")}>
        Try Today again
      </Link>
    </main>
  );
}
