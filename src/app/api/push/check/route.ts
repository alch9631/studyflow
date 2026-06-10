import { getCurrentUserId } from "@/lib/devUser";
import { handleApiError } from "@/lib/apiError";
import { readJsonBody, requireBodyString } from "@/lib/validate";
import { LIMITS } from "@/lib/limits";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimitPolicy";
import { isPushConfigured, isSubscriptionResyncNeeded } from "@/lib/push";

export const dynamic = "force-dynamic";

/**
 * Re-validate-on-load check for a stored push subscription.
 *
 * The client posts the endpoint of its current browser subscription; we answer
 * whether that subscription is still usable or must be re-synced (re-subscribed)
 * because it was registered against a different VAPID key — the key-rollover
 * case (created while push was unconfigured, or before a key rotation). The
 * client re-subscribes when `needsResync` is true and POSTs the fresh
 * subscription to /api/push/subscribe, which heals the stored row.
 *
 * Scoped to the current user (never probes another user's subscriptions) and
 * shares the per-user PUSH rate-limit budget. Leaks nothing but two booleans.
 */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    // Per-user rate limit before any DB work (429 on breach).
    if (!checkRateLimit("PUSH", userId)) return rateLimitResponse();
    // Size-guarded JSON read: rejects oversized bodies / bad JSON (400).
    const body = await readJsonBody<{ endpoint?: unknown }>(
      req,
      LIMITS.MAX_REQUEST_BODY_BYTES,
    );
    // Validate the endpoint through the shared body-string validator (presence +
    // length bound) — a missing or oversized value becomes a clean 400.
    const endpoint = requireBodyString(body.endpoint, "Endpoint", LIMITS.MAX_FIELD_LENGTH);
    const needsResync = await isSubscriptionResyncNeeded(userId, endpoint);
    return Response.json({ configured: isPushConfigured(), needsResync });
  } catch (err) {
    return handleApiError(err);
  }
}
