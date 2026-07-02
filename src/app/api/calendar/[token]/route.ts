import { prisma } from "@/lib/db";
import { buildCalendar } from "@/lib/ics";
import { handleApiError, notFound } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** How far back the feed reaches. Everything in the future is always included. */
const PAST_WINDOW_DAYS = 30;

/**
 * Live calendar subscribe feed. Calendar apps (Apple/Google) poll this URL by
 * the user's secret token and get the always-current study plan (bounded to
 * the last {@link PAST_WINDOW_DAYS} days + all future blocks). 404 if the
 * token doesn't match a user.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    // Bound the token so a junk/oversized path segment can't reach the DB query.
    if (!token || token.length > 200) {
      return notFound();
    }

    const user = await prisma.user.findUnique({
      where: { calendarToken: token },
      select: { id: true },
    });
    if (!user) {
      return notFound();
    }

    // Calendar apps poll this feed constantly, so don't serialize the user's
    // entire multi-semester history every time. Window: the recent past (30
    // days, so a just-finished week still shows) plus everything upcoming.
    const since = new Date(Date.now() - PAST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const blocks = await prisma.studyBlock.findMany({
      where: { course: { userId: user.id }, date: { gte: since } },
      // Exactly the CalendarBlock shape buildCalendar consumes — nothing else.
      select: {
        date: true,
        minutes: true,
        topicTitle: true,
        kind: true,
        startTime: true,
        endTime: true,
        course: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { kind: "asc" }],
    });

    return new Response(buildCalendar(blocks), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
