"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/components/i18n/messages";
import { haptics } from "@/components/haptics";
import { setTopicConfidence } from "../actions";

type Confidence = "solid" | "practice" | "struggling";

const LEVELS: { value: Confidence; labelKey: MessageKey; ariaKey: MessageKey; tone: string }[] = [
  {
    value: "solid",
    labelKey: "courseDetail.confidenceSolid",
    ariaKey: "courseDetail.confidenceSolidAria",
    tone:
      "data-[on=true]:border-green-500 data-[on=true]:bg-green-500 data-[on=true]:text-white dark:data-[on=true]:border-green-500",
  },
  {
    value: "practice",
    labelKey: "courseDetail.confidencePractice",
    ariaKey: "courseDetail.confidencePracticeAria",
    tone:
      "data-[on=true]:border-amber-500 data-[on=true]:bg-amber-500 data-[on=true]:text-white dark:data-[on=true]:border-amber-500",
  },
  {
    value: "struggling",
    labelKey: "courseDetail.confidenceStruggling",
    ariaKey: "courseDetail.confidenceStrugglingAria",
    tone:
      "data-[on=true]:border-rose-500 data-[on=true]:bg-rose-500 data-[on=true]:text-white dark:data-[on=true]:border-rose-500",
  },
];

/**
 * Per-topic confidence rating on the course-detail topic list. Rated ONCE per
 * topic (not per study session), it drives spaced reviews: "struggling" earns
 * more/earlier reviews, "solid" fewer — the plan re-adapts on the server when
 * you choose. Optimistic local state; rolls back + toasts on error. Re-tapping
 * the selected level clears it. Accessible radiogroup of real buttons.
 */
export default function TopicConfidence({
  topicId,
  initial,
}: {
  topicId: string;
  initial: Confidence | null;
}) {
  const t = useT();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Confidence | null>(initial);
  const [, startTransition] = useTransition();

  function choose(value: Confidence) {
    const next = selected === value ? null : value; // re-tap clears
    const prev = selected;
    setSelected(next); // optimistic
    haptics.tap();
    const fd = new FormData();
    fd.set("topicId", topicId);
    fd.set("confidence", next ?? "");
    startTransition(async () => {
      try {
        await setTopicConfidence(fd);
        if (next) toast(t("courseDetail.confidenceSaved"), "success");
      } catch {
        setSelected(prev); // roll back
        toast(t("courseDetail.confidenceError"), "error");
      }
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("courseDetail.confidenceGroup")}
      className="ml-7 mt-1 flex flex-wrap items-center gap-1.5"
    >
      <span className="mr-0.5 text-xs text-gray-500 dark:text-gray-400">
        {t("courseDetail.confidencePrompt")}
      </span>
      {LEVELS.map((lvl) => {
        const on = selected === lvl.value;
        return (
          <button
            key={lvl.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t(lvl.ariaKey)}
            data-on={on}
            onClick={() => choose(lvl.value)}
            className={`rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-500 dark:border-gray-700 dark:text-gray-300 ${lvl.tone}`}
          >
            {t(lvl.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
