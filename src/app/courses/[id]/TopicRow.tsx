"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Check, Trash2 } from "lucide-react";
import SwipeRow from "@/components/SwipeRow";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { deleteTopic } from "../actions";

const TopicDeleteContext = createContext<(() => void) | null>(null);
export const useTopicDelete = () => useContext(TopicDeleteContext);

/** The whole topic row swipes; its checkbox and pen keep their normal tap actions. */
export default function TopicRow({ topicId, title, done, children }: { topicId: string; title: string; done: boolean; children: ReactNode }) {
  const t = useT();
  const { toast } = useToast();
  const content = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const removed = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    const row = content.current?.closest("li");
    returnFocus.current = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>("button") ?? null;
    try {
      const data = new FormData(); data.set("topicId", topicId);
      const result = await deleteTopic(data);
      if (!result.ok) { toast(t("courseDetail.topicDeleteError"), "error"); return; }
      removed.current = true;
      setConfirmOpen(false);
      toast(t("courseDetail.topicDeleted"));
    } catch { toast(t("courseDetail.topicDeleteError"), "error"); }
    finally { inFlight.current = false; setPending(false); }
  }

  return <TopicDeleteContext.Provider value={() => setConfirmOpen(true)}>
    <SwipeRow className="rounded-xl" disabled={pending}
      left={{ label: t("courses.swipeDelete"), icon: <Trash2 className="h-4 w-4" aria-hidden="true" />, tone: "danger", onTrigger: () => setConfirmOpen(true) }}
      right={done ? undefined : { label: t("block.done"), icon: <Check className="h-4 w-4" aria-hidden="true" />, tone: "success", onTrigger: () => {
        const form = content.current?.querySelector<HTMLFormElement>("form[data-topic-toggle]");
        // The checkbox owns optimistic/offline state and the duplicate-submit guard.
        if (form?.querySelector('button[aria-pressed="false"]')) form.requestSubmit();
      } }}>
      <div ref={content} data-topic-swipe={topicId} className="relative rounded-xl border border-gray-200 bg-background p-3 dark:border-gray-800">
        {children}
      </div>
    </SwipeRow>
    <Dialog open={confirmOpen} onOpenChange={(next) => { if (!pending) setConfirmOpen(next); }}>
      <DialogContent onCloseAutoFocus={(event) => {
        event.preventDefault();
        const target = removed.current ? returnFocus.current : content.current?.querySelector<HTMLElement>("button");
        (target?.isConnected ? target : document.getElementById("topics-heading"))?.focus();
      }}>
        <DialogTitle>{t("courseDetail.topicDeleteTitle")}</DialogTitle>
        <DialogDescription><strong className="block text-foreground [overflow-wrap:anywhere]">{title}</strong>{t("courseDetail.topicDeleteDescription")}</DialogDescription>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
          <Button type="button" variant="danger-solid" disabled={pending} aria-busy={pending} onClick={() => void remove()}>{pending ? t("courses.deleting") : t("courseDetail.deleteTopic")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </TopicDeleteContext.Provider>;
}
