import { getT } from "@/components/i18n/server";

export default async function LoadingFocus() {
  const t = await getT();
  return <div aria-busy="true" aria-label={t("flow.starting")} className="fixed inset-0 z-50 flex flex-col bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
    <div className="mx-auto w-full max-w-lg"><div className="h-6 w-40 rounded bg-surface-muted" /></div>
    <div className="flex flex-1 items-center justify-center"><div className="h-20 w-56 rounded bg-surface-muted motion-safe:animate-pulse" /></div>
    <p role="status" className="mb-5 text-center text-sm text-muted-foreground">{t("flow.starting")}</p>
    <div className="mx-auto grid w-full max-w-lg grid-cols-2 gap-3" aria-hidden="true"><div className="h-12 rounded-full bg-surface-muted" /><div className="h-12 rounded-full bg-surface-muted" /></div>
  </div>;
}
