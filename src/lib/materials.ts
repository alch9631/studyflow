import { prisma } from "./db";
import { classifyTextSource, MAX_UPLOAD_BYTES } from "./fileText";
import { isFileCategory, categorizeByFilename } from "./fileCategory";
import { ValidationError } from "./validate";
import { notFound } from "./apiError";

/** Both basic uploads and optional AI analysis use the same original-file policy. */
export async function prepareMaterial(file: File, category: unknown) {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new ValidationError("Choose a file up to 20 MB.");
  const type = classifyTextSource(file.name, file.type);
  const filename = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 200) || "material";
  const mimeType = type === "pdf" ? "application/pdf"
    : type === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "text/plain; charset=utf-8";
  const content = new Uint8Array(await file.arrayBuffer());
  return { filename, mimeType, sizeBytes: file.size, content,
    category: isFileCategory(category) ? category : categorizeByFilename(filename) ?? "sonstiges" };
}

export async function guardMaterialStorage(db: Pick<typeof prisma, "moduleFile">, userId: string, courseId: string, size: number) {
  const count = await db.moduleFile.count({ where: { courseId } });
  const stored = await db.moduleFile.aggregate({ where: { course: { userId } }, _sum: { sizeBytes: true } });
  if (count >= 100 || (stored._sum.sizeBytes ?? 0) + size > 200 * 1024 * 1024) {
    throw new ValidationError("Material storage is full. Remove unused files first.");
  }
}

/** Save the original, then recognize its structure locally on every upload path. */
export async function storeMaterial(userId: string, courseId: string, file: File, category: unknown) {
  if (!await prisma.course.count({ where: { id: courseId, userId } })) return null;
  const data = await prepareMaterial(file, category);
  const saved = await prisma.$transaction(async (tx) => {
    await guardMaterialStorage(tx, userId, courseId, file.size);
    return tx.moduleFile.create({ data: { courseId, ...data }, select: { id: true, filename: true } });
  });
  try {
    const { recognizeMaterialOutline } = await import("./materialOutline");
    await recognizeMaterialOutline(userId, saved.id);
  } catch {
    // A metadata/write failure must not report a failed upload after the
    // original was committed. Opening the course will retry recognition.
    console.warn("[material-recognition] Recognition will retry when the material is opened.");
  }
  return saved;
}

export function readMaterial(userId: string, id: string) {
  return prisma.moduleFile.findFirst({
    where: { id, course: { userId } },
    select: { filename: true, mimeType: true, content: true },
  });
}

export function availableMaterialIds(userId: string, courseId: string) {
  return prisma.moduleFile.findMany({ where: { courseId, course: { userId }, content: { not: null } }, select: { id: true } });
}

export function materialResponse(file: { filename: string; mimeType: string | null; content: Uint8Array | null } | null, download = false) {
  if (!file?.content) return notFound("Material not found. Older uploads may need uploading again.");
  // Untrusted files never become HTML, SVG, or executable same-origin content.
  const pdf = file.mimeType === "application/pdf";
  const plain = file.mimeType?.startsWith("text/");
  const mime = pdf ? "application/pdf" : plain ? "text/plain; charset=utf-8" : "application/octet-stream";
  return new Response(new Uint8Array(file.content), { headers: {
    "Content-Type": mime,
    "Content-Disposition": `${!download && (pdf || plain) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
  } });
}
