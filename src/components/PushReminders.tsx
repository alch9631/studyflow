"use client";

import { useEffect, useState } from "react";
import { buttonClasses } from "./ui";

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

/**
 * Study-reminders opt-in. Web push needs a secure context (https/localhost) AND
 * a configured VAPID public key, so locally / over plain http this renders a
 * "coming soon" state — it fully activates once the app is deployed.
 */
export default function PushReminders() {
  // Lazy init reads the browser capabilities on the client (false during SSR),
  // avoiding a setState-in-effect.
  const [available] = useState(
    () =>
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      window.isSecureContext &&
      !!VAPID_PUBLIC
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!available) return;
    // setState only in the async callback (an allowed external-sync pattern).
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [available]);

  async function enable() {
    setBusy(true);
    setError("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifications were not allowed.");
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
      if (!res.ok) throw new Error("Couldn't save the subscription.");
      setSubscribed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
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
    } catch {
      setError("Couldn't turn reminders off.");
    } finally {
      setBusy(false);
    }
  }

  if (!available) {
    return (
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        🔔 Study reminders are coming soon — push notifications need StudyFlow to be
        deployed (served over https). They&apos;ll switch on automatically then.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy}
        className={buttonClasses(subscribed ? "secondary" : "primary", "md")}
      >
        {busy ? "Working…" : subscribed ? "Turn off reminders" : "🔔 Enable reminders"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
