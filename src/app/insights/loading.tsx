export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl animate-pulse p-4 sm:p-8">
      <div className="mb-1 h-8 w-40 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="mb-6 h-4 w-56 rounded bg-gray-100 dark:bg-gray-800" />

      {/* Headline stats grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
          >
            <div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800" />
            <div className="mt-2 h-7 w-20 rounded bg-gray-200 dark:bg-gray-800" />
            <div className="mt-1 h-3 w-12 rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>

      {/* Section cards */}
      {[0, 1].map((i) => (
        <div
          key={i}
          className="mt-6 rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
        >
          <div className="h-5 w-32 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-3 h-2.5 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
          <div className="mt-3 h-3 w-3/4 rounded bg-gray-100 dark:bg-gray-800" />
        </div>
      ))}

      {/* By course list */}
      <div className="mt-6 space-y-2">
        <div className="mb-3 h-5 w-24 rounded bg-gray-200 dark:bg-gray-800" />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 p-3 dark:border-gray-800"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-3 w-16 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </main>
  );
}
