"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startFocusSession } from "@/app/courses/studyActions";
import { useLocale, useT } from "./i18n/I18nProvider";
import { Button } from "./ui/button";

/** A single tap starts the course/topic's next timer. Preparation is optional. */
export default function QuickStudySetup({ courseId, topicId, fileId, label }: {
  courseId: string; topicId?: string; title?: string; fileId?: string; label?: string;
}) {
  const t = useT();
  const language = useLocale();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function start() {
    if (pending) return;
    setPending(true); setError(false);
    try {
      const result = await startFocusSession({ courseId, topicId, fileId, language });
      if (!result.ok) throw new Error();
      try { sessionStorage.setItem("sf-focus-start", result.blockId); } catch {}
      router.push(`/focus?blockId=${encodeURIComponent(result.blockId)}`);
    } catch { setError(true); setPending(false); }
  }
  return <div>
    <Button type="button" className="w-full" disabled={pending} aria-busy={pending} onClick={() => void start()}>
      {pending ? t("flow.starting") : label ?? t("focus.startFocus")}
    </Button>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{t("focus.startError")}</p>}
  </div>;
}
