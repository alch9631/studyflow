import { readBuildId } from "@/lib/appVersion";

export const dynamic = "force-dynamic";

/** Public release identity only; no accounts, configuration or health details. */
export async function GET() {
  return Response.json({ buildId: await readBuildId() }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
