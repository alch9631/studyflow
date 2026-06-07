import { prisma } from "@/lib/db";
import { buildCalendar } from "@/lib/ics";

export const dynamic = "force-dynamic";

/**
 * Live calendar subscribe feed. Calendar apps (Apple/Google) poll this URL by
 * the user's secret token and get the always-current study plan. 404 if the
 * token doesn't match a user.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const user = await prisma.user.findUnique({
    where: { calendarToken: token },
    select: { id: true },
  });
  if (!user) {
    return new Response("Not found", { status: 404 });
  }

  const blocks = await prisma.studyBlock.findMany({
    where: { course: { userId: user.id } },
    include: { course: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { kind: "asc" }],
  });

  return new Response(buildCalendar(blocks), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
    },
  });
}
