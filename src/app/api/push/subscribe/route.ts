import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";

export const dynamic = "force-dynamic";

/** Save (upsert) a browser push subscription for the current user. */
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ ok: false, error: "missing fields" }, { status: 400 });
  }
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth, userId },
    create: { endpoint, p256dh, auth, userId },
  });
  return Response.json({ ok: true });
}
