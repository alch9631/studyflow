"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/components/i18n/messages";
import { haptics } from "@/components/haptics";
import { saveNote, deleteNote, setTopicConfidence } from "../actions";

/**
 * #1 — One compact 📝 affordance per topic that opens a small popover holding
 * BOTH the per-topic note AND the confidence/difficulty selector.
 *
 * Behaviour:
 *  • Single trigger button (📝) replaces the old inline confidence row + the
 *    separate note disclosure. A dot on the trigger flags "has a note".
 *  • Picking a confidence/difficulty level **auto-closes** the popover (the
 *    plan re-adapts server-side); the note can still be edited while open.
 *  • A small coloured badge on the topic row shows the selected level when set.
 *  • Accessible: Escape closes, focus returns to the trigger, click-outside
 *    closes, the trigger is aria-expanded, the levels are a radiogroup.
 *
 * Reuses the existing server actions (`setTopicConfidence`, `saveNote`,
 * `deleteNote`) — no duplicated persistence logic.
 */

type Confidence = "solid" | "practice" | "struggling";

const LEVELS: {
  value: Confidence;
  labelKey: MessageKey;
  ariaKey: MessageKey;
  tone: string;
  badge: string;
}[] = [
  {
    value: "solid",
    labelKey: "courseDetail.confidenceSolid",
    ariaKey: "courseDetail.confidenceSolidAria",
    tone:
      "data-[on=true]:border-green-500 data-[on=true]:bg-green-500 data-[on=true]:text-white dark:data-[on=true]:border-green-500",
    badge:
      "border-green-300 bg-green-100 text-green-700 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300",
  },
  {
    value: "practice",
    labelKey: "courseDetail.confidencePractice",
    ariaKey: "courseDetail.confidencePracticeAria",
    tone:
      "data-[on=true]:border-amber-500 data-[on=true]:bg-amber-500 data-[on=true]:text-white dark:data-[on=true]:border-amber-500",
    badge:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    value: "struggling",
    labelKey: "courseDetail.confidenceStruggling",
    ariaKey: "courseDetail.confidenceStrugglingAria",
    tone:
      "data-[on=true]:border-rose-500 data-[on=true]:bg-rose-500 data-[on=true]:text-white dark:data-[on=true]:border-rose-500",
    badge:
      "border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300",
  },
];

const MAX_LENGTH = 10_000; // mirrors LIMITS.MAX_NOTE_LENGTH (server-enforced)
const DEBOUNCE_MS = 900;

type Status = "idle" | "dirty" | "saving" | "saved" | "error";

const STATUS_KEY: Record<Status, MessageKey> = {
  idle: "courseDetail.noteStatusIdle",
  dirty: "courseDetail.noteStatusDirty",
  saving: "courseDetail.noteStatusSaving",
  saved: "courseDetail.noteStatusSaved",
  error: "courseDetail.noteStatusError",
};

export default function TopicMeta({
  topicId,
  topicTitle,
  initialConfidence,
  initialNote,
  showConfidence,
}: {
  topicId: string;
  topicTitle: string;
  initialConfidence: Confidence | null;
  initialNote: string;
  /** Confidence is only meaningful once a topic is done (matches the old gate). */
  showConfidence: boolean;
}) {
  const t = useT();
  const { toast } = useToast();

  // ── popover open/close ────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // Escape closes (returns focus); click-outside closes (no focus steal).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    }
    function onPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      close(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  // ── confidence ────────────────────────────────────────────────────────────
  const [confidence, setConfidence] = useState<Confidence | null>(initialConfidence);
  const [, startTransition] = useTransition();

  function chooseConfidence(value: Confidence) {
    const next = confidence === value ? null : value; // re-tap clears
    const prev = confidence;
    setConfidence(next); // optimistic
    haptics.tap();
    // Auto-close on a pick (the note stays editable next time it's opened).
    close();
    const fd = new FormData();
    fd.set("topicId", topicId);
    fd.set("confidence", next ?? "");
    startTransition(async () => {
      try {
        await setTopicConfidence(fd);
        if (next) toast(t("courseDetail.confidenceSaved"), "success");
      } catch {
        setConfidence(prev); // roll back
        toast(t("courseDetail.confidenceError"), "error");
      }
    });
  }

  // ── note (autosave; mirrors the old NoteEditor contract) ──────────────────
  const [body, setBody] = useState(initialNote);
  const [status, setStatus] = useState<Status>(initialNote ? "saved" : "idle");
  const savedRef = useRef(initialNote);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusId = useId();

  const hasNote = body.trim().length > 0;
  const nearLimit = body.length > MAX_LENGTH * 0.9;

  const persist = useCallback(
    async (value: string) => {
      if (value === savedRef.current) return;
      setStatus("saving");
      const fd = new FormData();
      fd.set("topicId", topicId);
      fd.set("body", value);
      try {
        await saveNote(fd);
        savedRef.current = value;
        setStatus((s) => (s === "saving" ? "saved" : s));
      } catch {
        setStatus("error");
      }
    },
    [topicId],
  );

  function onChangeNote(value: string) {
    setBody(value);
    setStatus(value === savedRef.current ? "saved" : "dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void persist(value), DEBOUNCE_MS);
  }

  function flushNote() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void persist(body);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function clearNote() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBody("");
    setStatus("saving");
    const fd = new FormData();
    fd.set("topicId", topicId);
    try {
      await deleteNote(fd);
      savedRef.current = "";
      setStatus("idle");
      toast(t("courseDetail.noteCleared"), "success");
    } catch {
      setStatus("error");
      toast(t("courseDetail.noteClearError"), "error");
    }
  }

  const activeLevel = LEVELS.find((l) => l.value === confidence);

  return (
    <>
      {/* Row badge: shows the selected confidence/difficulty level inline. */}
      {showConfidence && activeLevel && (
        <span
          className={`ml-7 mt-1 inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-xs font-medium ${activeLevel.badge}`}
        >
          {t(activeLevel.labelKey)}
        </span>
      )}

      {/* Single 📝 affordance, top-right of the topic row. */}
      <div className="absolute right-2 top-2">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("courseDetail.topicMetaAria", { title: topicTitle })}
          title={t("courseDetail.topicMeta")}
          onClick={() => setOpen((o) => !o)}
          className="relative inline-flex cursor-pointer items-center justify-center rounded p-0.5 leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span aria-hidden="true" className="text-base leading-none">📝</span>
          {hasNote && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white dark:ring-gray-900"
              aria-label={t("courseDetail.noteHasNote")}
              title={t("courseDetail.noteHasNoteTitle")}
            />
          )}
        </button>

        {open && (
          <div
            ref={panelRef}
            role="dialog"
            aria-label={t("courseDetail.topicMeta")}
            className="absolute right-0 top-8 z-20 w-[min(20rem,75vw)] space-y-3 rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg dark:border-gray-800 dark:bg-gray-900"
          >
            {/* Confidence / difficulty — picking a level auto-closes. */}
            {showConfidence && (
              <div className="space-y-1.5">
                <p
                  id={`${statusId}-conf`}
                  className="text-xs font-medium text-gray-700 dark:text-gray-200"
                >
                  {t("courseDetail.confidenceGroup")}
                </p>
                <div
                  role="radiogroup"
                  aria-labelledby={`${statusId}-conf`}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {LEVELS.map((lvl) => {
                    const on = confidence === lvl.value;
                    return (
                      <button
                        key={lvl.value}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={t(lvl.ariaKey)}
                        data-on={on}
                        onClick={() => chooseConfidence(lvl.value)}
                        className={`rounded-full border border-gray-300 px-2.5 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:border-gray-500 dark:border-gray-700 dark:text-gray-300 ${lvl.tone}`}
                      >
                        {t(lvl.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Note — autosaves; stays editable while the popover is open. */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-200">
                {t("courseDetail.note")}
              </p>
              <Textarea
                aria-label={t("courseDetail.noteAria", { title: topicTitle })}
                aria-describedby={statusId}
                value={body}
                maxLength={MAX_LENGTH}
                rows={3}
                placeholder={t("courseDetail.notePlaceholder")}
                onChange={(e) => onChangeNote(e.target.value)}
                onBlur={flushNote}
                className="w-full text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <p
                  id={statusId}
                  aria-live="polite"
                  className={`text-xs ${
                    status === "error"
                      ? "text-red-600 dark:text-red-400"
                      : status === "saved"
                        ? "text-green-600 dark:text-green-400"
                        : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {t(STATUS_KEY[status])}
                </p>
                <div className="flex shrink-0 items-center gap-2">
                  {nearLimit && (
                    <span className="text-xs tabular-nums text-gray-400">
                      {body.length}/{MAX_LENGTH}
                    </span>
                  )}
                  {hasNote && (
                    <button
                      type="button"
                      onClick={clearNote}
                      className="rounded text-xs font-medium text-gray-500 transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand dark:text-gray-400 dark:hover:text-red-400"
                    >
                      {t("courseDetail.clearNote")}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
