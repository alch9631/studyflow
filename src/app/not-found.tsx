import Link from "next/link";

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
        <Link
          href="/today"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          🗓️ Go to Today
        </Link>
        <Link
          href="/courses"
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          📚 My Courses
        </Link>
      </div>
    </main>
  );
}
