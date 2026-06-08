import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { buildCalendar } from "@/lib/ics";
import { handleApiError } from "@/lib/apiError";

export const dynamic = "force-dynamic";

/** Exports all upcoming study/review blocks as a downloadable .ics calendar. */
export async function GET() {
  try {
    const userId = await getCurrentUserId();
    const blocks = await prisma.studyBlock.findMany({
      where: { course: { userId } },
      include: { course: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { kind: "asc" }],
    });

    return new Response(buildCalendar(blocks), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": "attachment; filename=studyflow.ics",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
