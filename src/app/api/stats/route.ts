import { getCurrentUserId } from "@/lib/devUser";
import { todayISO } from "@/lib/planService";
import { gatherStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/** JSON analytics for the current user (same data the Insights page renders). */
export async function GET() {
  const userId = await getCurrentUserId();
  const stats = await gatherStats(userId, todayISO());
  return Response.json(stats);
}
