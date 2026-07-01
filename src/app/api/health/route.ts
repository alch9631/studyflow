import { prisma } from "@/lib/db";

// Never cached — a health probe must reflect live state on every hit.
export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe for deploy platforms (Railway `healthcheckPath`, the
 * Docker HEALTHCHECK). Returns 200 only when the DB actually answers; a dead or
 * unmigrated database returns 503 so the platform doesn't route traffic to a
 * broken instance. The landing page (`/`) returns 200 even with a dead DB, so it
 * is NOT a valid health target — this route is.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false, error: "database unavailable" }, { status: 503 });
  }
}
