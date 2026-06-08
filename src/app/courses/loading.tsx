export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl animate-pulse p-4 sm:p-8">
      {/* Header: title + "New course" button */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="h-8 w-40 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="h-9 w-32 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />
      </div>

      {/* Course cards */}
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800"
          >
            {/* Priority pill + name, exam date */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="h-5 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
                <div className="mt-2 h-5 w-44 rounded bg-gray-200 dark:bg-gray-800" />
              </div>
              <div className="shrink-0 text-right">
                <div className="ml-auto h-3 w-20 rounded bg-gray-100 dark:bg-gray-800" />
                <div className="ml-auto mt-1.5 h-3 w-16 rounded bg-gray-100 dark:bg-gray-800" />
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800" />
            <div className="mt-1.5 h-3 w-28 rounded bg-gray-100 dark:bg-gray-800" />

            {/* Actions */}
            <div className="mt-3 flex gap-2">
              <div className="h-8 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
              <div className="h-8 w-20 rounded-full bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
