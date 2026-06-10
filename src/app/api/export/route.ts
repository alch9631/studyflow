import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { handleApiError } from "@/lib/apiError";
import {
  parseExportFormat,
  buildExportJSON,
  buildExportCSV,
  type ExportCourse,
} from "@/lib/export";

export const dynamic = "force-dynamic";

/** Today as YYYY-MM-DD, for the download filename. */
function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Exports the current user's courses, topics, and progress as a downloadable
 * file in either JSON (?format=json, default) or flat CSV (?format=csv).
 */
export async function GET(req: Request) {
  try {
    const format = parseExportFormat(new URL(req.url).searchParams.get("format"));
    const userId = await getCurrentUserId();

    // One query (include) — no N+1. Topics pulled in their explicit order.
    const courses: ExportCourse[] = await prisma.course.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        examDate: true,
        createdAt: true,
        topics: {
          orderBy: { order: "asc" },
          select: { id: true, title: true, effort: true, done: true, order: true },
        },
      },
    });

    if (format === "csv") {
      return new Response(buildExportCSV(courses), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename=studyflow-export-${todayStamp()}.csv`,
        },
      });
    }

    return new Response(JSON.stringify(buildExportJSON(courses), null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename=studyflow-export-${todayStamp()}.json`,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
