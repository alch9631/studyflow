import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { badRequest, handleApiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** Save (upsert) a browser push subscription for the current user. */
export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserId();
    let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }
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
