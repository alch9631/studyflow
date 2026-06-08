import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { badRequest, handleApiError } from "@/lib/apiError";
import { readJsonBody } from "@/lib/validate";
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
    const body = await readJsonBody<{ endpoint?: string }>(
      req,
      LIMITS.MAX_REQUEST_BODY_BYTES,
    );
    if (!body.endpoint) {
      return badRequest("Missing endpoint.");
    }
    if (body.endpoint.length > 2000) {
      return badRequest("Field too long.");
    }
    await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
    return Response.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
