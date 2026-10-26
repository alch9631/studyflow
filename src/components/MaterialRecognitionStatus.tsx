"use client";

import { useEffect, useState } from "react";
import { recognizeMaterial } from "@/app/courses/studyActions";
import { readMaterialOutline, type MaterialOutline } from "@/lib/documentOutline";
import { readMaterialRecognition, recognitionNeedsRefresh } from "@/lib/materialRecognition";
import { useT } from "./i18n/I18nProvider";
import { Button } from "./ui/button";

// Older uploads are processed when their preparation dialog is open. Closing
// it cancels queued work; persisted results are reused on the next review.
let queue: Promise<unknown> = Promise.resolve();

export default function MaterialRecognitionStatus({ fileId, analysis, onRecognized }: {
  fileId: string; analysis: string | null; onRecognized: (outline: MaterialOutline | null) => void;
}) {
  const t = useT();
  const [recognition, setRecognition] = useState(() => readMaterialRecognition(analysis));
  const [outline, setOutline] = useState(() => readMaterialOutline(analysis));
  const [pending, setPending] = useState(!readMaterialRecognition(analysis));
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    if (!retry && !recognitionNeedsRefresh(analysis)) {
      // A refresh or another tab may have completed recognition already.
      // Synchronize from the server without starting a second extraction.
      void Promise.resolve().then(() => {
        if (!active) return;
        const cachedOutline = readMaterialOutline(analysis);
        setRecognition(readMaterialRecognition(analysis)); setOutline(cachedOutline);
        setPending(false); setFailed(false); onRecognized(cachedOutline);
      });
      return () => { active = false; };
    }
    const work = queue.catch(() => {}).then(async () => {
      if (!active) return;
      setPending(true); setFailed(false);
      try {
        let result = await recognizeMaterial(fileId, retry > 0);
        // Local recognition does not use the AI budget. If many old files use
        // the mutation bucket, let it refill before continuing the queue.
        for (let attempt = 0; active && !result.ok && result.error === "RATE_LIMITED" && attempt < 2; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (active) result = await recognizeMaterial(fileId, retry > 0);
        }
        if (!active) return;
        if (!result.ok) { setFailed(true); return; }
        setRecognition(result.recognition); setOutline(result.outline); onRecognized(result.outline);
      } catch { if (active) setFailed(true); }
      finally { if (active) setPending(false); }
    });
    queue = work;
    return () => { active = false; };
  }, [fileId, analysis, retry, onRecognized]);

  const error = failed || recognition?.status === "failed";
  const chapters = outline?.entries.filter((entry) => !entry.parentId).length ?? 0;
  const status = pending ? "recognizingAutomatic" : error ? "recognitionFailed" : recognition?.status === "ready" ? "recognizedAutomatic"
    : recognition?.status === "unreadable" ? "recognitionUnreadable" : recognition?.status === "skipped" ? "recognitionExercises" : "recognitionNoOutline";
  return <div className="space-y-1">
    <p role="status" className="text-sm text-muted-foreground">{t(`flow.${status}`, { chapters, sections: outline?.units.length ?? 0 })}</p>
    {error && !pending && <Button type="button" variant="secondary" className="w-full whitespace-normal" onClick={() => setRetry((value) => value + 1)}>{t("flow.retryRecognition")}</Button>}
  </div>;
}
