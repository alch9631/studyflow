"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { PencilLine } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import type { MessageKey } from "@/components/i18n/messages";
import { haptics } from "@/components/haptics";
import { saveNote, deleteNote, setTopicConfidence } from "../actions";

/** One pen opens the topic editor; notes autosave and flush before closing. */

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
      "data-[on=true]:border-green-700 data-[on=true]:bg-green-700 data-[on=true]:text-white",
    badge:
      "border-green-300 bg-green-100 text-green-700 dark:border-green-900 dark:bg-green-950/50 dark:text-green-300",
  },
  {
    value: "practice",
    labelKey: "courseDetail.confidencePractice",
    ariaKey: "courseDetail.confidencePracticeAria",
    tone:
      "data-[on=true]:border-amber-400 data-[on=true]:bg-amber-200 data-[on=true]:text-amber-950",
    badge:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
  },
  {
    value: "struggling",
    labelKey: "courseDetail.confidenceStruggling",
    ariaKey: "courseDetail.confidenceStrugglingAria",
    tone:
      "data-[on=true]:border-rose-700 data-[on=true]:bg-rose-700 data-[on=true]:text-white",
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
  children,
}: {
  topicId: string;
  topicTitle: string;
  initialConfidence: Confidence | null;
  initialNote: string;
  /** Confidence is only meaningful once a topic is done (matches the old gate). */
  showConfidence: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const { toast } = useToast();

  // ── popover open/close ────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  function close() {
    flushNote();
    setOpen(false);
  }

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
        // Success toast only when the server really saved it — the action
        // no-ops (rate limit, stale topic id, invalid value) and says so.
        const res = await setTopicConfidence(fd);
        if (res.ok) {
          if (next) toast(t("courseDetail.confidenceSaved"), "success");
        } else {
          setConfidence(prev); // roll back
          toast(t("courseDetail.confidenceError"), "error");
        }
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
      const res = await deleteNote(fd);
      if (res.ok) {
        savedRef.current = "";
        setStatus("idle");
        toast(t("courseDetail.noteCleared"), "success");
      } else {
        setStatus("error");
        toast(t("courseDetail.noteClearError"), "error");
      }
    } catch {
      setStatus("error");
      toast(t("courseDetail.noteClearError"), "error");
    }
  }

  const activeLevel = LEVELS.find((l) => l.value === confidence);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) flushNote(); setOpen(next); }}>
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
        <DialogTrigger asChild>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={t("courseDetail.editTopic", { title: topicTitle })}
          title={t("courseDetail.editTopic", { title: topicTitle })}
          className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full p-2 leading-none hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <PencilLine className="h-4 w-4" aria-hidden="true" />
          {hasNote && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white dark:ring-gray-900"
              aria-label={t("courseDetail.noteHasNote")}
              title={t("courseDetail.noteHasNoteTitle")}
            />
          )}
        </button>
        </DialogTrigger>
      </div>

          <DialogContent mobileSheet data-topic-editor>
            <DialogTitle>{topicTitle}</DialogTitle>
            <DialogDescription className="sr-only">{t("courseDetail.topicMeta")}</DialogDescription>
            <div className="mt-4 space-y-4">
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
                        className={`min-h-11 rounded-full border border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-500 dark:border-gray-700 dark:text-gray-300 ${lvl.tone}`}
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
                className="w-full"
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
                      className="min-h-11 rounded px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {t("courseDetail.clearNote")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {children}
            </div>
          </DialogContent>
    </Dialog>
  );
}
