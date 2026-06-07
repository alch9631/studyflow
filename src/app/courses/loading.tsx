export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl animate-pulse p-4 sm:p-8">
      <div className="mb-8 h-8 w-40 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    </main>
  );
}
