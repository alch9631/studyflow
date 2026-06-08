"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** Route-level error boundary — renders inside the app shell (nav + styles). */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-4xl">😵</p>
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-gray-500 dark:text-gray-400">
        StudyFlow hit an unexpected error — your data is safe. Try again, or head back to Today.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="secondary">
          <Link href="/today">🗓️ Go to Today</Link>
        </Button>
      </div>
    </main>
  );
}
