import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/devUser";
import { handleApiError } from "@/lib/apiError";
import {
  parseExportFormat,
  filterExportCourses,
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
 * `?courseId=` narrows the export to that single course (400 on an unknown id).
 */
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const format = parseExportFormat(params.get("format"));
    const courseId = params.get("courseId")?.trim() || undefined;
    const userId = await getCurrentUserId();

    // One query (include) — no N+1. Topics pulled in their explicit order.
    // Ownership-scoped: a courseId the user doesn't own matches nothing here
    // and reads as unknown below — never another user's data.
    const rows: ExportCourse[] = await prisma.course.findMany({
      where: { userId, ...(courseId ? { id: courseId } : {}) },
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

    // No-op without a courseId; throws ValidationError (→ 400) on unknown id.
    const courses = filterExportCourses(rows, courseId);

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
