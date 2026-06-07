import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Remove a browser push subscription by endpoint. */
export async function POST(req: Request) {
  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (!body.endpoint) {
    return Response.json({ ok: false, error: "missing endpoint" }, { status: 400 });
  }
  if (body.endpoint.length > 2000) {
    return Response.json({ ok: false, error: "field too long" }, { status: 400 });
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint } });
  return Response.json({ ok: true });
}
