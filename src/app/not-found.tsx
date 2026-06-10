import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <div
        className="rounded-md px-3 py-1.5 text-lg font-extrabold tracking-tight text-white"
        style={{ backgroundColor: "#00509b" }}
      >
        TUHH
      </div>
      <h1 className="text-3xl font-bold">404</h1>
      <p className="text-gray-500 dark:text-gray-400">
        That page isn&apos;t in your study plan. Let&apos;s get you back on track.
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/today">🗓️ Go to Today</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/courses">📚 My Courses</Link>
        </Button>
      </div>
    </main>
  );
}
