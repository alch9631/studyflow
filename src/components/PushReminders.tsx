"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { useToast } from "./Toast";
import { useT } from "./i18n/I18nProvider";

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Convert a base64url VAPID key to the ArrayBuffer-backed view the Push API expects. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** True when this browser can do web push at all (secure context + the APIs + a key). */
function browserSupportsPush(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    window.isSecureContext &&
    !!VAPID_PUBLIC
  );
}

/**
 * High-level state of the opt-in:
 *  - checking      reading browser caps + asking the server if push is configured
 *  - unsupported   this browser/context can't do web push (insecure, missing APIs…)
 *  - unconfigured  the deploy has no VAPID keys yet — clean, clearly-disabled no-op
 *  - ready         push works; offer enable / disable / send-test
 */
type Status = "checking" | "unsupported" | "unconfigured" | "ready";

/** Which action is mid-flight, so each button can show its own pending state. */
type Pending = null | "toggle" | "test";

/**
 * Study-reminders opt-in, wired to the real web-push backend.
 *
 * On mount it confirms two things before offering anything: the browser can do
 * push (secure context + APIs + the public VAPID key), and — via
 * `/api/push/status` — the deploy actually has VAPID keys configured. Either
 * missing → a graceful, clearly-disabled "coming soon" message instead of a
 * button that can't work.
 *
 * When ready it requests permission, subscribes with the VAPID public key, and
 * POSTs the subscription to `/api/push/subscribe`. A subscribed device can send
 * itself a test notification (rendered locally by the service worker, so it
 * needs no server round-trip) or turn reminders back off.
 */
export default function PushReminders() {
  const { toast } = useToast();
  const t = useT();
  const [status, setStatus] = useState<Status>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState("");

  // On mount: settle browser support, ask the server if push is configured, and
  // read any existing subscription. setState happens only inside the async
  // callbacks (an allowed external-sync pattern), guarded against unmount.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!browserSupportsPush()) {
        if (active) setStatus("unsupported");
        return;
      }
      try {
        // Guard against a hanging/404 status endpoint leaving the UI stuck on
        // "Checking…" forever: abort after ~5s so we fall through to the graceful
        // disabled state below instead of spinning.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        let res: Response;
        try {
          res = await fetch("/api/push/status", { signal: controller.signal });
        } finally {
          clearTimeout(timeout);
        }
        const data = (await res.json()) as { configured?: boolean };
        if (!active) return;
        if (!data.configured) {
          setStatus("unconfigured");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!active) return;
        setSubscribed(!!sub);
        setStatus("ready");
      } catch {
        // Can't confirm the backend is ready — fail safe to the disabled state
        // rather than offer a button that might not work.
        if (active) setStatus("unconfigured");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setPending("toggle");
    setError("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        throw new Error(
          perm === "denied"
            ? t("pushReminders.blocked")
            : t("pushReminders.notAllowed"),
        );
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC as string),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });
      if (!res.ok) throw new Error(t("pushReminders.saveFailed"));
      setSubscribed(true);
      toast(t("pushReminders.onForDevice"), "success");
    } catch (e) {
      const message = e instanceof Error ? e.message : t("pushReminders.somethingWrong");
      setError(message);
      toast(message, "error");
    } finally {
      setPending(null);
    }
  }

  async function disable() {
    setPending("toggle");
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
      toast(t("pushReminders.turnedOff"), "info");
    } catch {
      const message = t("pushReminders.turnOffFailed");
      setError(message);
      toast(message, "error");
    } finally {
      setPending(null);
    }
  }

  /** Show a local test notification via the service worker — no server round-trip. */
  async function sendTest() {
    setPending("test");
    setError("");
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(t("common.appName"), {
        body: t("pushReminders.testBody"),
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: "/today" },
      });
      toast(t("pushReminders.testSent"), "success");
    } catch {
      const message = t("pushReminders.testFailed");
      setError(message);
      toast(message, "error");
    } finally {
      setPending(null);
    }
  }

  if (status === "checking") {
    return (
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400" role="status">
        {t("pushReminders.checking")}
      </p>
    );
  }

  if (status === "unsupported" || status === "unconfigured") {
    return (
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        {t("pushReminders.comingSoon")}
      </p>
    );
  }

  const busy = pending !== null;

  return (
    <div className="mt-3">
      {subscribed && (
        <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400">
          <span aria-hidden>✓</span>
          {t("pushReminders.onForDevice")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={subscribed ? disable : enable}
          disabled={busy}
          variant={subscribed ? "secondary" : "primary"}
        >
          {pending === "toggle"
            ? t("pushReminders.working")
            : subscribed
              ? t("pushReminders.turnOff")
              : t("pushReminders.enable")}
        </Button>

        {subscribed && (
          <Button
            type="button"
            onClick={sendTest}
            disabled={busy}
            variant="secondary"
          >
            {pending === "test" ? t("pushReminders.sending") : t("pushReminders.sendTest")}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
