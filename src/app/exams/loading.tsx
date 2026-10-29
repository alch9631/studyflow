export default function Loading() {
  return <main className="mx-auto max-w-2xl p-4 sm:p-8" aria-busy="true">
    <div className="h-11 w-32 rounded bg-surface-muted motion-safe:animate-pulse" />
    <div className="mt-6 divide-y divide-border" aria-hidden="true">
      {[0, 1, 2].map((item) => <div key={item} className="space-y-2 py-5">
        <div className="h-5 w-3/4 rounded bg-surface-muted motion-safe:animate-pulse" />
        <div className="h-4 w-36 rounded bg-surface-muted motion-safe:animate-pulse" />
      </div>)}
    </div>
  </main>;
}
