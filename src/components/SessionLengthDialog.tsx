"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { useT } from "./i18n/I18nProvider";
import { sessionLength } from "@/lib/sessionLength";
import { focusHref } from "@/lib/focusNavigation";

export type SessionChoice = { id: string; topicId?: string; kind: string; title: string; minutes: number; elapsed: number };

/** One explicit duration choice; opening this sheet never starts a clock. */
export default function SessionLengthDialog({ choice, onClose, returnFocus }: { choice: SessionChoice; onClose: () => void; returnFocus: () => void }) {
  const t = useT(); const router = useRouter(); const inputId = useId();
  const minimum = Math.min(600, Math.floor(choice.elapsed / 60) + 1);
  const [minutes, setMinutes] = useState(String(Math.max(minimum, choice.minutes)));
  const [pending, setPending] = useState(false);
  const valid = sessionLength(minutes);
  useEffect(() => {
    if (!valid || valid < minimum) return;
    const timer = setTimeout(() => router.prefetch(focusHref(choice.id, choice.topicId, choice.kind, valid)), 150);
    return () => clearTimeout(timer);
  }, [router, valid, minimum, choice.id, choice.topicId, choice.kind]);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent mobileSheet onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus(); }}>
      <DialogTitle>{t("flow.time")}</DialogTitle><DialogDescription>{choice.title}</DialogDescription>
      <form className="mt-4 space-y-4" onSubmit={(event) => {
        event.preventDefault(); if (!valid || valid < minimum || pending) return;
        setPending(true);
        try { sessionStorage.setItem("sf-focus-start", choice.id); } catch {}
        router.push(focusHref(choice.id, choice.topicId, choice.kind, valid));
        onClose();
      }}>
        <label htmlFor={inputId} className="block text-sm font-medium">{t("focus.minutesLabel")}</label>
        <Input id={inputId} type="number" inputMode="numeric" min={minimum} max={600} step={1} required value={minutes} onChange={(event) => setMinutes(event.target.value)} className="w-full" />
        {choice.elapsed > 0 && <p className="text-sm text-muted-foreground">{t("focus.alreadyStudied", { minutes: Math.floor(choice.elapsed / 60) })}</p>}
        <Button type="submit" className="w-full" disabled={!valid || valid < minimum || pending}>{t("minimal.start")}</Button>
      </form>
    </DialogContent>
  </Dialog>;
}
