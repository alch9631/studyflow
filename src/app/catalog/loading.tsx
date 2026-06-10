export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl animate-pulse p-4 sm:p-8">
      {/* Header: eyebrow + program title */}
      <div className="mb-5">
        <div className="h-3 w-32 rounded bg-gray-100 dark:bg-gray-800" />
        <div className="mt-2 h-7 w-64 rounded bg-gray-200 dark:bg-gray-800" />
      </div>

      {/* Intro info card */}
      <div className="mb-5 h-20 rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900" />

      {/* Section groups */}
      <div className="space-y-3">
        {[0, 1].map((s) => (
          <div
            key={s}
            className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800"
          >
            {/* Section header */}
            <div className="flex items-center justify-between gap-2 bg-gray-50 px-3 py-2.5 dark:bg-gray-900">
              <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="h-5 w-8 rounded-full bg-gray-200 dark:bg-gray-800" />
            </div>
            {/* Module rows */}
            <div className="space-y-1.5 p-2.5">
              {[0, 1, 2].map((m) => (
                <div
                  key={m}
                  className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-4 w-4 shrink-0 rounded bg-gray-100 dark:bg-gray-800" />
                    <div className="h-4 flex-1 rounded bg-gray-200 dark:bg-gray-800" />
                  </div>
                  <div className="ml-7 mt-2 h-3 w-16 rounded bg-gray-100 dark:bg-gray-800" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
