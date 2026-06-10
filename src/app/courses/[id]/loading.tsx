export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl animate-pulse p-4 sm:p-8">
      {/* Back link */}
      <div className="h-4 w-24 rounded bg-gray-100 dark:bg-gray-800" />

      {/* Header: title + countdown pill + meta, action buttons */}
      <div className="mb-6 mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="h-8 w-56 rounded bg-gray-200 dark:bg-gray-800" />
          <div className="mt-2 flex items-center gap-2">
            <div className="h-5 w-24 rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className="h-4 w-48 rounded bg-gray-100 dark:bg-gray-800" />
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto">
          <div className="h-9 w-full rounded-full bg-gray-100 dark:bg-gray-800 sm:w-40" />
        </div>
      </div>

      {/* Course settings bar */}
      <div className="mb-6 h-12 rounded-xl border border-gray-200 dark:border-gray-800" />

      {/* Planning banner */}
      <div className="mb-6 h-16 rounded-lg bg-gray-100 dark:bg-gray-800" />

      {/* "Update your progress" section */}
      <div className="mb-8">
        <div className="mb-2 h-6 w-48 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-20 rounded-lg border border-gray-200 dark:border-gray-800" />
      </div>

      {/* Topics list */}
      <div className="mb-8">
        <div className="mb-3 h-6 w-24 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="h-5 w-5 rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
              <div className="h-4 w-56 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          ))}
        </div>
      </div>

      {/* Study plan day cards */}
      <div>
        <div className="mb-3 h-6 w-28 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="mb-2 h-4 w-32 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="space-y-2">
                {[0, 1].map((j) => (
                  <div key={j} className="flex justify-between">
                    <div className="h-3 w-40 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-3 w-12 rounded bg-gray-100 dark:bg-gray-800" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
