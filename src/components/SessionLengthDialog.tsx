"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { useT } from "./i18n/I18nProvider";
import { sessionLength } from "@/lib/sessionLength";
import { focusHref } from "@/lib/focusNavigation";

export type SessionChoice = { id: string; topicId?: string; kind: string; title: string; minutes: number; elapsed: number };

/** One explicit duration choice; opening this sheet never starts a clock. */
export default function SessionLengthDialog({ choice, onClose, returnFocus }: { choice: SessionChoice; onClose: () => void; returnFocus: () => void }) {
  const t = useT(); const router = useRouter(); const groupName = useId();
  const selectedOption = useRef<HTMLInputElement>(null);
  const minimum = Math.min(600, Math.floor(choice.elapsed / 60) + 1);
  // Older sessions can already exceed the presets; keep those resumable.
  const options = minimum > 90 ? [10, 30, 60, 90, Math.max(minimum, choice.minutes)] : [10, 30, 60, 90];
  const [minutes, setMinutes] = useState(() => options.find((value) => value >= Math.max(minimum, choice.minutes)) ?? options[options.length - 1]);
  const [pending, setPending] = useState(false);
  const valid = sessionLength(String(minutes));
  useEffect(() => {
    if (!valid || valid < minimum) return;
    const timer = setTimeout(() => router.prefetch(focusHref(choice.id, choice.topicId, choice.kind, valid)), 150);
    return () => clearTimeout(timer);
  }, [router, valid, minimum, choice.id, choice.topicId, choice.kind]);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent mobileSheet onOpenAutoFocus={(event) => { event.preventDefault(); selectedOption.current?.focus(); }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
      <DialogTitle>{t("flow.time")}</DialogTitle><DialogDescription>{choice.title}</DialogDescription>
      <form className="mt-4 space-y-4" onSubmit={(event) => {
        event.preventDefault(); if (!valid || valid < minimum || pending) return;
        setPending(true);
        try { sessionStorage.setItem("sf-focus-start", choice.id); } catch {}
        router.push(focusHref(choice.id, choice.topicId, choice.kind, valid));
        onClose();
      }}>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("focus.minutesLabel")}</legend>
          <div className="grid grid-cols-4 gap-2">
            {options.map((value) => <label key={value} className={value > 90 ? "col-span-4" : undefined}>
              <input ref={minutes === value ? selectedOption : undefined} className="peer sr-only" type="radio" name={groupName} value={value} checked={minutes === value} disabled={value < minimum || pending} onChange={() => setMinutes(value)} />
              <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-input text-base font-medium tabular-nums transition-colors hover:bg-accent peer-checked:border-brand peer-checked:bg-brand peer-checked:text-brand-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface peer-disabled:cursor-not-allowed peer-disabled:opacity-40">{value}</span>
            </label>)}
          </div>
        </fieldset>
        {choice.elapsed > 0 && <p className="text-sm text-muted-foreground">{t("focus.alreadyStudied", { minutes: Math.floor(choice.elapsed / 60) })}</p>}
        <Button type="submit" className="w-full" disabled={!valid || valid < minimum || pending}>{t("minimal.start")}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
