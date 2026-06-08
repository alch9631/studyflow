import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { handleApiError } from "@/lib/apiError";
import { readJsonBody, requireBodyString } from "@/lib/validate";
import { LIMITS, guardCount } from "@/lib/limits";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimitPolicy";

export const dynamic = "force-dynamic";

/** Save (upsert) a browser push subscription for the current user. */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    // Per-user rate limit before any DB work (429 on breach).
    if (!checkRateLimit("PUSH", userId)) return rateLimitResponse();
    // Size-guarded JSON read: rejects oversized bodies / bad JSON (400).
    const body = await readJsonBody<{
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    }>(req, LIMITS.MAX_REQUEST_BODY_BYTES);
    // Validate every field through the shared body-string validator (presence +
    // length bound) — the same helper the rest of the input layer uses, so a
    // missing or oversized field becomes a clean 400 via handleApiError before
    // anything reaches the DB write.
    const endpoint = requireBodyString(body.endpoint, "Endpoint", LIMITS.MAX_FIELD_LENGTH);
    const p256dh = requireBodyString(body.keys?.p256dh, "p256dh key", 500);
    const auth = requireBodyString(body.keys?.auth, "auth key", 500);
    // Cap subscriptions per user, but only when this endpoint is new (an upsert
    // of an existing endpoint must still be allowed to refresh its keys).
    // Existence check only — no need to load the stored keys.
    const existing = await prisma.pushSubscription.findUnique({
      where: { endpoint },
      select: { id: true },
    });
    if (!existing) {
      guardCount(
        await prisma.pushSubscription.count({ where: { userId } }),
        LIMITS.MAX_PUSH_SUBSCRIPTIONS_PER_USER,
        "push subscriptions",
      );
    }
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh, auth, userId },
      create: { endpoint, p256dh, auth, userId },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
