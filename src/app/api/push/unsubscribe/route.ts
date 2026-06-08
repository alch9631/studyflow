import { prisma } from "@/lib/db";
import { badRequest, handleApiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** Remove a browser push subscription by endpoint. */
export async function POST(req: Request) {
  try {
    let body: { endpoint?: string };
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }
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
