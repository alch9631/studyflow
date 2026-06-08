import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { handleApiError } from "@/lib/apiError";
import { readJsonBody, requireBodyString } from "@/lib/validate";
import { LIMITS } from "@/lib/limits";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimitPolicy";

export const dynamic = "force-dynamic";

/** Remove a browser push subscription by endpoint. */
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
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
