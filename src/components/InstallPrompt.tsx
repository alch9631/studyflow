"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { useT } from "./i18n/I18nProvider";

/**
 * "Install StudyFlow" nudge — turns the PWA into a home-screen app.
 *
 * Two platforms, two stories, one shared rule (never nag):
 *  - Android / Chrome (and Chromium desktop) fire `beforeinstallprompt`. We
 *    intercept it, stash the deferred event, and surface our own branded card;
 *    the real OS dialog only opens when the user taps "Install".
 *  - iOS Safari has no prompt API at all, so we detect it and show a one-time
 *    hint pointing at the Share → "Add to Home Screen" flow instead.
 *
 * A single localStorage flag records "the user has dealt with this" — set when
 * they install, dismiss, or (on Android) accept/reject the OS dialog — so the
 * nudge never reappears. Already-installed (standalone) sessions and the flag
 * both short-circuit the whole thing, matching the SSR render (nothing) so
 * there's no hydration flash. Presentation only.
 */

const STORAGE_KEY = "studyflow:install-dismissed";

/** Which surface to show, or `null` for nothing (the SSR + default state). */
type Mode = null | "android" | "ios";

/**
 * The non-standard event Chromium fires before offering its install banner.
 * Not in the DOM lib types, so we describe just the bits we use.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True once the app is running as an installed PWA — no point nudging then. */
function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari exposes its own flag rather than the display-mode media query.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari only — Chrome/Firefox on iOS can't add to the home screen either. */
function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua);
  // Exclude in-app/other browsers (CriOS = Chrome, FxiOS = Firefox, etc.).
  const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opios/i.test(ua);
  return iOS && safari;
}

function hasDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // Private mode / storage off — fail open, show it once.
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Worst case the nudge can reappear next visit — acceptable, not harmful.
  }
}

export default function InstallPrompt() {
  const t = useT();
  const [mode, setMode] = useState<Mode>(null);
  const deferred = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || hasDismissed()) return;

    function onBeforeInstall(e: Event) {
      // Stop Chrome's own mini-infobar; we present our own card instead.
      e.preventDefault();
      deferred.current = e as BeforeInstallPromptEvent;
      setMode("android");
    }

    function onInstalled() {
      // They took the offer (via our button or the browser UI) — never ask again.
      rememberDismissed();
      deferred.current = null;
      setMode(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no event to wait on, so offer the hint ourselves — but a beat
    // after load, so it reads as a gentle suggestion, not a launch interruption.
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    if (isIosSafari()) {
      hintTimer = setTimeout(() => setMode((m) => m ?? "ios"), 2500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (hintTimer) clearTimeout(hintTimer);
    };
  }, []);

  function dismiss() {
    rememberDismissed();
    setMode(null);
  }

  async function install() {
    const evt = deferred.current;
    if (!evt) return;
    // Hide our card immediately — the OS dialog is now the foreground UI.
    setMode(null);
    deferred.current = null;
    try {
      await evt.prompt();
      await evt.userChoice;
    } finally {
      // Whatever they chose, we've had our one ask. `appinstalled` also fires on
      // accept, but writing here covers the "dismissed the OS dialog" path too.
      rememberDismissed();
    }
  }

  if (mode === null) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-[calc(1rem+env(safe-area-inset-left))] motion-safe:animate-[toast-in_220ms_ease-out] lg:bottom-6"
    >
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-gray-900">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"
          aria-hidden="true"
        >
          <InstallIcon />
        </div>

        <div className="min-w-0 flex-1">
          <h2
            id="install-prompt-title"
            className="text-sm font-semibold text-gray-900 dark:text-gray-100"
          >
            {t("installPrompt.title")}
          </h2>

          {mode === "android" ? (
            <>
              <p className="mt-0.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {t("installPrompt.androidBody")}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button type="button" size="sm" onClick={install}>
                  {t("installPrompt.install")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={dismiss}
                >
                  {t("installPrompt.notNow")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-0.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {t("installPrompt.iosTapPrefix")}{" "}
                <ShareIcon className="-mt-0.5 inline-block h-4 w-4 align-middle text-brand" />{" "}
                {t("installPrompt.iosShareSuffix")}{" "}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {t("installPrompt.iosAddToHome")}
                </span>{" "}
                {t("installPrompt.iosTail")}
              </p>
              <div className="mt-3">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={dismiss}
                >
                  {t("installPrompt.gotIt")}
                </Button>
              </div>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label={t("installPrompt.dismissAria")}
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
        >
          <CloseIcon />
        </button>
      </div>
    </div>
  );
}

function InstallIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 16V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
