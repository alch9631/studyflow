"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/components/i18n/messages";
import { haptics } from "@/components/haptics";
import { setTopicConfidence } from "@/app/courses/actions";
import { Textarea } from "@/components/ui/textarea";

type Confidence = "solid" | "practice" | "struggling";

/** One flashcard in the practice queue (serializable across the RSC boundary). */
export type PracticeCard = {
  topicId: string;
  topicTitle: string;
  question: string;
  /** The topic's current confidence, if any — pre-selects the matching rating. */
  confidence: Confidence | null;
  answerKey?: string | null;
  sourceHref?: string | null;
};

/**
 * The three self-rating levels, mapped 1:1 to the topic `confidence` values the
 * spaced-review engine already understands. Picking one persists straight to the
 * topic (via `setTopicConfidence`) and advances — so retrieval practice closes
 * the loop into review spacing rather than being a throwaway quiz.
 */
const LEVELS: {
  value: Confidence;
  labelKey: MessageKey;
  hintKey: MessageKey;
  tone: string;
}[] = [
  {
    value: "solid",
    labelKey: "practice.rateSolid",
    hintKey: "practice.rateSolidHint",
    tone:
      "border-green-300 text-green-700 hover:border-green-500 hover:bg-green-50 dark:border-green-900 dark:text-green-300 dark:hover:bg-green-950/40",
  },
  {
    value: "practice",
    labelKey: "practice.ratePractice",
    hintKey: "practice.ratePracticeHint",
    tone:
      "border-amber-300 text-amber-800 hover:border-amber-500 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40",
  },
  {
    value: "struggling",
    labelKey: "practice.rateStruggling",
    hintKey: "practice.rateStrugglingHint",
    tone:
      "border-rose-300 text-rose-700 hover:border-rose-500 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/40",
  },
];

/**
 * Calm, focused active-recall flow: ONE question at a time, lots of quiet space
 * (the spirit of Focus). The student tries to recall, checks the answer or source,
 * then self-rates Solid · Needs practice · Struggling. The rating persists to the
 * question's topic via the shared `setTopicConfidence` action (feeding the spaced
 * reviews) and the card advances. When the queue is done, a gentle finish screen
 * offers another pass or a way back to the course.
 *
 * Manual check questions include a stored answer key. Legacy generated prompts
 * show an honest source-comparison instruction when no answer key is available.
 */
export default function PracticeSession({
  courseId,
  courseName,
  cards,
}: {
  courseId: string;
  courseName: string;
  cards: PracticeCard[];
}) {
  const t = useT();
  const { toast } = useToast();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [response, setResponse] = useState("");

  const total = cards.length;
  const done = index >= total;
  const card = done ? null : cards[index];

  function advance() {
    setRevealed(false);
    setResponse("");
    setIndex((i) => i + 1);
  }

  function rate(value: Confidence) {
    if (!card || pending) return;
    haptics.tap();
    // Persist the rating to the topic's confidence (shared action → spaced
    // reviews re-adapt server-side), then advance only after saving succeeds.
    const fd = new FormData();
    fd.set("topicId", card.topicId);
    fd.set("confidence", value);
    startTransition(async () => {
      try {
        const result = await setTopicConfidence(fd);
        if (!result.ok) { toast(t("practice.rateError"), "error"); return; }
        advance();
      } catch {
        toast(t("practice.rateError"), "error");
      }
    });
  }

  function restart() {
    setIndex(0);
    setRevealed(false);
    setResponse("");
  }

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col px-6 py-8">
      {/* Quiet header: the mode + which course, then a calm progress line. */}
      <div className="mb-10 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-ink">
          {t("practice.title")}
        </span>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("practice.course", { course: courseName })}
        </p>
      </div>

      {done ? (
        // Gentle finish: no scores, no pressure — just acknowledgement + choices.
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <PartyPopper className="h-7 w-7 shrink-0 text-brand" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">{t("practice.finishTitle")}</h1>
          <p className="max-w-sm text-muted-foreground">
            {t.n("practice.finishBody", total, { count: total })}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <Button type="button" size="lg" onClick={restart}>
              {t("practice.again")}
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href={`/courses/${courseId}`}>{t("practice.backToCourse")}</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Progress — a calm "n of total", not a stress-inducing bar. */}
          <p
            className="mb-6 text-center text-xs font-medium text-muted-foreground"
            aria-live="polite"
          >
            {t("practice.progress", { current: index + 1, total })}
          </p>

          {/* The one card — large, centred, room to breathe. */}
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {card!.topicTitle}
            </p>
            <h1 className="mt-4 text-balance text-2xl font-semibold leading-snug sm:text-3xl">
              {card!.question}
            </h1>

            <label className="mt-5 w-full text-left text-sm font-medium">
              {t("study.response")}<Textarea value={response} onChange={(event) => setResponse(event.target.value)} rows={3} maxLength={4000} className="mt-1 w-full" />
            </label>

            {revealed ? (
              <div className="mt-6 w-full whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-4 text-left text-sm">
                {card!.answerKey ? <><p className="font-semibold">{t("study.answerKey")}</p><p className="mt-2">{card!.answerKey}</p></>
                  : <p className="text-muted-foreground">{t("study.noAnswerKey")}</p>}
                {card!.sourceHref && <a href={card!.sourceHref} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center font-medium text-brand-ink underline">{t("study.openMaterial")}</a>}
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="mt-8"
                onClick={() => setRevealed(true)}
                disabled={!response.trim()}
              >
                {t("study.checkResult")}
              </Button>
            )}
          </div>

          {/* Self-rating — only after the recall cue, so the student commits to a
              recall attempt first. Each rating writes to the topic's confidence
              and advances. */}
          {revealed && (
            <div className="mt-auto pt-10">
              <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
                {t("practice.ratePrompt")}
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {LEVELS.map((lvl) => (
                  <button
                    key={lvl.value}
                    type="button"
                    onClick={() => rate(lvl.value)}
                    disabled={pending}
                    className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${lvl.tone}`}
                  >
                    {t(lvl.labelKey)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {t(lvl.hintKey)}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={advance}
                disabled={pending}
                className="mt-4 block w-full rounded-full px-3 py-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("practice.skip")}
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
