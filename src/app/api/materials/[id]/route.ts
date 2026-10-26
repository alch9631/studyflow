import { getCurrentUserId } from "@/lib/devUser";
import { materialResponse, readMaterial } from "@/lib/materials";
import { handleApiError } from "@/lib/apiError";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getCurrentUserId();
    const { id } = await params;
    return materialResponse(await readMaterial(userId, id), new URL(request.url).searchParams.get("download") === "1");
  } catch (error) { return handleApiError(error); }
}
