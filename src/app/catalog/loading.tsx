export default function Loading() {
  return (
    <main className="mx-auto max-w-2xl animate-pulse p-4 sm:p-8">
      <div className="mb-6 h-8 w-64 rounded bg-gray-200 dark:bg-gray-800" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    </main>
  );
}
