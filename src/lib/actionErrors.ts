/**
 * Error classification + logging for server actions that call out to AI / other
 * external services. We never swallow these failures silently: each is logged
 * server-side with a stable, greppable context tag, and mapped to a coarse kind
 * so the UI can show an accurate banner — AI not set up vs. a transient network
 * blip vs. a genuine error — instead of one catch-all "failed".
 */

export type AIFailureKind = "unconfigured" | "transient" | "error";

/** Best-effort message string for any thrown value (Error, string, or unknown). */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return String(err);
}

function numField(err: unknown, key: string): number | undefined {
  if (err && typeof err === "object" && key in err) {
    const v = (err as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
  }
  return undefined;
}

function strField(err: unknown, key: string): string | undefined {
  if (err && typeof err === "object" && key in err) {
    const v = (err as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return undefined;
}

/** Node/undici connection-level error codes that mean "retry later", not "broken". */
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
]);

/** Message fragments that signal a transient network/availability problem. */
const TRANSIENT_PATTERNS = [
  "timeout",
  "timed out",
  "fetch failed",
  "network",
  "socket hang up",
  "connection error",
  "connection refused",
  "connection reset",
  "econnreset",
  "econnrefused",
  "etimedout",
  "enotfound",
  "overloaded",
  "temporarily unavailable",
  "service unavailable",
];

/**
 * Classify an AI/external-service failure into a coarse kind:
 *  - `unconfigured` — no/invalid API key (our own guard, or an upstream auth error)
 *  - `transient`    — network/timeout/connection error, or a 429 / 5xx from the provider
 *  - `error`        — anything else (a real bug, bad input, unreadable file, …)
 */
export function classifyAIFailure(err: unknown): AIFailureKind {
  const msg = errorMessage(err).toLowerCase();

  // Not configured: our own "no AI key set" guard, or a key referenced by name.
  if (
    msg.includes("no ai key set") ||
    msg.includes("openai_api_key") ||
    msg.includes("anthropic_api_key")
  ) {
    return "unconfigured";
  }

  // Transient: connection-level codes from Node/undici.
  const code = strField(err, "code");
  if (code && TRANSIENT_CODES.has(code)) return "transient";

  // Transient: rate-limit (429) or server errors (5xx) from the provider SDKs.
  const status = numField(err, "status") ?? numField(err, "statusCode");
  if (status === 429 || (status !== undefined && status >= 500 && status <= 599)) {
    return "transient";
  }

  // Transient: SDK error classes (e.g. APIConnectionError / APIConnectionTimeoutError).
  const name = (strField(err, "name") ?? "").toLowerCase();
  if (name.includes("connection") || name.includes("timeout")) return "transient";

  if (TRANSIENT_PATTERNS.some((p) => msg.includes(p))) return "transient";

  return "error";
}

/**
 * Log a server-action failure with a stable context tag and its coarse kind —
 * never the raw stack and never a secret. The tag (`[action:reoptimizeCourse]`)
 * makes failures greppable in server logs without leaking anything to the user.
 */
export function logActionError(context: string, err: unknown): void {
  const status = numField(err, "status") ?? numField(err, "statusCode");
  const suffix = status !== undefined ? ` (status ${status})` : "";
  console.error(
    `[action:${context}] ${classifyAIFailure(err)}: ${errorMessage(err)}${suffix}`,
  );
}

/**
 * Map a caught AI failure to a course-page banner code so the UI reason is
 * accurate: not-configured → `ai-unconfigured`, a transient network/timeout →
 * `ai-offline`, and anything else → the caller's generic code (e.g.
 * `optimize-failed` / `analyze-error`).
 */
export function aiFailureBanner(err: unknown, genericCode: string): string {
  const kind = classifyAIFailure(err);
  if (kind === "unconfigured") return "ai-unconfigured";
  if (kind === "transient") return "ai-offline";
  return genericCode;
}
