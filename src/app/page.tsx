export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="text-5xl">⚡</div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">StudyFlow</h1>
      <p className="max-w-md text-lg text-gray-500">
        The study plan that builds itself — and heals itself when you fall behind.
      </p>
      <div className="mt-2 rounded-full border border-gray-200 px-4 py-1.5 text-sm text-gray-400">
        🚧 Day 1 — foundation
      </div>
    </main>
  );
}
