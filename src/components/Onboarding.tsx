"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";

/**
 * First-run onboarding — a one-time, dismissible three-step intro shown to brand-
 * new users who haven't built a plan yet (no courses). It frames the core loop in
 * three short beats: add a course → check sessions off on Today → watch progress
 * on Insights.
 *
 * Why it lives here (presentation only): the server decides *eligibility* via the
 * `active` prop (the Today page passes its `hasNoPlan` signal — a brand-new user
 * with nothing scheduled), and this component decides *whether it's already been
 * seen* via a localStorage flag. Both must be true to open, so a returning user
 * who once dismissed it never sees it again, and a user who has any plan/courses
 * never triggers it in the first place.
 *
 * Accessibility comes from the shared {@link Dialog} primitive (Radix): focus
 * trap, restore-focus, Escape-to-close, `aria-modal`, and labelled/described
 * wiring via {@link DialogTitle}/{@link DialogDescription}. Escape, the backdrop,
 * the ✕, and "Skip" all route through `dismiss()` so the flag is always written.
 */

const STORAGE_KEY = "studyflow:onboarded";

type Step = {
  emoji: string;
  title: string;
  body: string;
};

const STEPS: readonly Step[] = [
  {
    emoji: "📚",
    title: "Add your first course",
    body: "Pick a TUHH module, import a syllabus, or add one by hand. StudyFlow reads it and works backward from your exam into a realistic day-by-day plan.",
  },
  {
    emoji: "✅",
    title: "Check off sessions on Today",
    body: "Each morning, open Today for exactly what to study — in order, for how long. Tap a session to mark it done; slip a day and StudyFlow re-plans around you.",
  },
  {
    emoji: "📊",
    title: "Watch it work on Insights",
    body: "Your streak, weekly consistency, GPA and credit points climb on Insights — the momentum that keeps you going all semester.",
  },
] as const;

export default function Onboarding({ active = false }: { active?: boolean }) {
  // Start closed so server and first client render agree (no hydration flash);
  // a mount-time effect opens it only once we've confirmed it's a fresh, unseen
  // user on the client where localStorage exists.
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Defer the open to a microtask so setState happens in a callback, not
    // synchronously in the effect body (the repo's allowed external-sync pattern
    // — see PushReminders). localStorage is read on the client only.
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
      } catch {
        // Private mode / storage disabled — fail open and show it this once.
      }
      setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore — worst case the intro shows again next visit.
    }
    setOpen(false);
  }

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <DialogContent showCloseButton={false} className="max-w-md">
        {/* Header: progress + skip. Skip is a quiet escape hatch, always present. */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div
            className="flex items-center gap-1.5"
            role="group"
            aria-label={`Step ${step + 1} of ${STEPS.length}`}
          >
            {STEPS.map((s, i) => (
              <span
                key={s.title}
                aria-hidden="true"
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step
                    ? "w-6 bg-brand"
                    : i < step
                      ? "w-1.5 bg-brand/50"
                      : "w-1.5 bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="-mr-1 rounded-full px-2 py-1 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            Skip
          </button>
        </div>

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-3xl">
          <span aria-hidden="true">{current.emoji}</span>
        </div>

        <DialogTitle className="mt-4">{current.title}</DialogTitle>
        <DialogDescription className="mt-2 leading-relaxed">
          {current.body}
        </DialogDescription>

        {/* Footer: Back is quiet, primary action dominates. On the last step the
            primary CTA both records the dismissal and drops the user straight
            into adding their first course. */}
        <div className="mt-6 flex items-center gap-2">
          {step > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => s - 1)}
              className="shrink-0"
            >
              Back
            </Button>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Takes 30 seconds
            </span>
          )}
          <div className="flex-1" />
          {isLast ? (
            <Button asChild onClick={dismiss}>
              <Link href="/catalog">Add my first course</Link>
            </Button>
          ) : (
            <Button type="button" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
