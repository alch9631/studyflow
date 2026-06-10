/**
 * Study-block list service.
 *
 * The `/today` page and the .ics calendar feeds fetch study blocks UNBOUNDED —
 * fine for those narrow, date-filtered or whole-file-export views. But a generic
 * "list my study blocks" JSON endpoint must be paginated: a long-running user
 * accrues hundreds of blocks, and returning them all in one response is the
 * unbounded-result-set problem this module fixes.
 *
 * Business logic + Prisma access live here; the route stays thin (parse params,
 * resolve the user, call this, shape the response). Every query is scoped to the
 * resolved `userId` via the course relation — ownership is enforced server-side,
 * never trusted from the client.
 */
import { prisma } from "./db";
import { buildPage, type Page, type PageParams } from "./pagination";

/** A single study block as the list endpoint returns it (only rendered fields). */
export interface StudyBlockListItem {
  id: string;
  date: Date;
  topicTitle: string;
  minutes: number;
  actualMinutes: number | null;
  completed: boolean;
  kind: string;
  course: { id: string; name: string };
}

/**
 * Fetch one bounded page of the user's study blocks plus the total count, in a
 * single round-trip (count + page run concurrently). Returns the standard
 * paginated envelope the frontend renders.
 *
 * Stable ordering: by date ascending, then kind, then id as the final
 * tie-breaker. The trailing `id` makes the order TOTAL (deterministic even when
 * two blocks share the same date + kind), so paging never skips or duplicates a
 * row across requests.
 */
export async function listStudyBlocks(
  userId: string,
  params: PageParams,
): Promise<Page<StudyBlockListItem>> {
  const where = { course: { userId } };

  const [items, total] = await Promise.all([
    prisma.studyBlock.findMany({
      where,
      // Exactly the fields the list item exposes — no over-fetch.
      select: {
        id: true,
        date: true,
        topicTitle: true,
        minutes: true,
        actualMinutes: true,
        completed: true,
        kind: true,
        course: { select: { id: true, name: true } },
      },
      orderBy: [{ date: "asc" }, { kind: "asc" }, { id: "asc" }],
      skip: params.skip,
      take: params.take,
    }),
    prisma.studyBlock.count({ where }),
  ]);

  return buildPage(items, total, params);
}
