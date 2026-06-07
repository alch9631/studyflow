export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl animate-pulse p-8">
      <div className="mb-6 h-8 w-56 rounded bg-gray-200" />
      <div className="mb-6 h-16 rounded-xl bg-gray-100 dark:bg-gray-800" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    </main>
  );
}
