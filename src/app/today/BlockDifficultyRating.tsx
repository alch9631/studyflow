"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/components/i18n/messages";
import { haptics } from "@/components/haptics";
import { rateBlock } from "../courses/actions";

type Difficulty = "easy" | "medium" | "hard";

const LEVELS: { value: Difficulty; labelKey: MessageKey; ariaKey: MessageKey; tone: string }[] = [
  {
    value: "easy",
    labelKey: "block.rateEasy",
    ariaKey: "block.rateEasyAria",
    tone:
      "data-[on=true]:border-green-500 data-[on=true]:bg-green-500 data-[on=true]:text-white dark:data-[on=true]:border-green-500",
  },
  {
    value: "medium",
    labelKey: "block.rateMedium",
    ariaKey: "block.rateMediumAria",
    tone:
      "data-[on=true]:border-amber-500 data-[on=true]:bg-amber-500 data-[on=true]:text-white dark:data-[on=true]:border-amber-500",
  },
  {
    value: "hard",
    labelKey: "block.rateHard",
    ariaKey: "block.rateHardAria",
    tone:
      "data-[on=true]:border-rose-500 data-[on=true]:bg-rose-500 data-[on=true]:text-white dark:data-[on=true]:border-rose-500",
  },
];

/**
 * Optional Easy / Medium / Hard rating for a completed Today block. Shown only
 * once the block is done — a quick follow-up tap that NEVER blocks or delays
 * marking done (it's a separate control with its own action). Tapping the
 * already-selected level clears the rating (toggle-off).
 *
 * Accessibility: a labelled `radiogroup` of three `radio` buttons, fully
 * keyboard-operable (each is a real `<button>`), with `aria-checked` reflecting
 * the selection and an `aria-label` per option. Optimistic local state updates
 * instantly; on a server error we roll back and toast.
 *
 * The rating feeds the planner: the next heal/replan weights spaced reviews by
 * it (hard topics earn more/earlier reviews). We deliberately don't replan on
 * each tap — that's picked up on the next plan rebuild.
 */
export default function BlockDifficultyRating({
  blockId,
  initial,
}: {
  blockId: string;
  initial: Difficulty | null;
}) {
  const t = useT();
  const { toast } = useToast();
  const [selected, setSelected] = useState<Difficulty | null>(initial);
  const [, startTransition] = useTransition();

  function choose(value: Difficulty) {
    const next = selected === value ? null : value; // re-tap clears
    const prev = selected;
    setSelected(next); // optimistic
    haptics.tap();
    const fd = new FormData();
    fd.set("blockId", blockId);
    fd.set("difficulty", next ?? "");
    fd.set("revalidate", "/today");
    startTransition(async () => {
      try {
        await rateBlock(fd);
        if (next) toast(t("block.rateSaved"), "success");
      } catch {
        setSelected(prev); // roll back
        toast(t("block.rateError"), "error");
      }
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label={t("block.rateGroupLabel")}
      className="mt-2 flex items-center gap-1.5"
    >
      <span className="mr-0.5 text-xs text-gray-500 dark:text-gray-400">
        {t("block.ratePrompt")}
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
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors border-gray-300 text-gray-600 hover:border-gray-500 dark:border-gray-700 dark:text-gray-300 ${lvl.tone}`}
          >
            {t(lvl.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
