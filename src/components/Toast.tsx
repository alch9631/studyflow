"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Lightweight, dependency-free toast system for action feedback.
 *
 * Wrap the app once in <ToastProvider> (done in the root layout), then call
 * `useToast().toast(...)` from any client component to show a transient,
 * auto-dismissing confirmation or error. Styling reuses StudyFlow's tokens
 * (rounded surfaces, brand/green/amber/red) and is dark-mode aware. The live
 * region is `aria-live="polite"` so screen readers announce each message.
 */

export type ToastKind = "success" | "error" | "info";

export type ToastAction = {
  /** Button label, e.g. "Undo". Keep it a single short verb. */
  label: string;
  /** Run when the button is pressed; the toast dismisses right after. */
  onClick: () => void;
};

export type ToastOptions = {
  /** Override the auto-dismiss delay (ms). Errors default to a longer 6s. */
  duration?: number;
  /** Optional inline action button (e.g. "Undo") shown before the dismiss ✕. */
  action?: ToastAction;
};

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
  duration: number;
  action?: ToastAction;
};

type ToastContextValue = {
  toast: (message: string, kind?: ToastKind, opts?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 3500,
  error: 6000,
};

const KIND_STYLES: Record<ToastKind, string> = {
  success:
    "border-green-300 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/70 dark:text-green-200",
  error:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/70 dark:text-red-200",
  info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/70 dark:text-blue-200",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "⚠️",
  info: "ℹ️",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "success", opts?: ToastOptions) => {
      const id = nextId.current++;
      const duration = opts?.duration ?? DEFAULT_DURATION[kind];
      setToasts((prev) => [
        ...prev,
        { id, message, kind, duration, action: opts?.action },
      ]);
    },
    [],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const handle = setTimeout(() => onDismiss(item.id), item.duration);
    return () => clearTimeout(handle);
  }, [item.id, item.duration, onDismiss]);

  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className={`pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg motion-safe:animate-[toast-in_180ms_ease-out] ${KIND_STYLES[item.kind]}`}
    >
      <span aria-hidden className="mt-px shrink-0">
        {KIND_ICON[item.kind]}
      </span>
      <span className="min-w-0 flex-1 break-words">{item.message}</span>
      {item.action ? (
        <button
          type="button"
          onClick={() => {
            item.action?.onClick();
            onDismiss(item.id);
          }}
          className="-my-0.5 shrink-0 rounded-md border border-current/30 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-current/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
        >
          {item.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss"
        className="-mr-1 shrink-0 rounded px-1 text-current/70 transition-colors hover:text-current"
      >
        ✕
      </button>
    </div>
  );
}

/** Access the toast dispatcher. Must be used under <ToastProvider>. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}
