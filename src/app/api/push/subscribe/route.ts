import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { badRequest, handleApiError } from "@/lib/apiError";
import { readJsonBody } from "@/lib/validate";
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
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
    }>(req, LIMITS.MAX_REQUEST_BODY_BYTES);
    const endpoint = body.endpoint;
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return badRequest("Missing required fields.");
    }
    // Bound the fields so an oversized payload can't reach the DB write.
    if (endpoint.length > 2000 || p256dh.length > 500 || auth.length > 500) {
      return badRequest("Field too long.");
    }
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
