import { getCurrentUserId } from "@/lib/devUser";
import { listStudyBlocks } from "@/lib/blockService";
import { parsePageParams } from "@/lib/pagination";
import { handleApiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/**
 * Paginated JSON list of the current user's study blocks.
 *
 *   GET /api/blocks?page=1&pageSize=50
 *
 * Bounded by design: `pageSize` defaults to 50 and is clamped to 100 max, so a
 * client can never pull the whole (unbounded) set in one response. Returns the
 * standard list envelope ({ items, page, pageSize, total, totalPages, hasMore }).
 * Bad pagination params -> 400. Scoped to the resolved user; no cross-user data.
 */
export async function GET(req: Request) {
  try {
    const params = parsePageParams(new URL(req.url).searchParams);
    const userId = await getCurrentUserId();
    const page = await listStudyBlocks(userId, params);
    return Response.json(page);
  } catch (err) {
    return handleApiError(err);
  }
}
