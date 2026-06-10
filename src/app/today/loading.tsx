export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl animate-pulse p-6 sm:p-8">
      {/* Header: title + date subtitle */}
      <div className="h-8 w-32 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="mb-6 mt-2 h-4 w-56 rounded bg-gray-100 dark:bg-gray-800" />

      {/* Pomodoro timer card */}
      <div className="mb-6 rounded-2xl border border-gray-200 p-5 dark:border-gray-800">
        <div className="mx-auto h-12 w-32 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="mx-auto mt-3 h-8 w-40 rounded-full bg-gray-100 dark:bg-gray-800" />
      </div>

      {/* Today's blocks list */}
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-gray-800"
          >
            <div className="h-6 w-6 shrink-0 rounded border border-gray-200 bg-gray-100 dark:border-gray-800 dark:bg-gray-800" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-40 rounded bg-gray-200 dark:bg-gray-800" />
              <div className="mt-1.5 h-3 w-24 rounded bg-gray-100 dark:bg-gray-800" />
            </div>
            <div className="h-3 w-12 shrink-0 rounded bg-gray-100 dark:bg-gray-800" />
            <div className="h-7 w-16 shrink-0 rounded-full bg-gray-100 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    </main>
  );
}
