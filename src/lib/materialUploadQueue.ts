import { categorizeByFilename } from "./fileCategory";
import { classifyTextSource, isWithinUploadLimit } from "./fileText";

export type MaterialUploadFailure = { file: File; reason: "size" | "type" | "upload" };

/** One request per file keeps a selection within the existing per-request limit. */
export async function uploadMaterialFiles(
  courseId: string,
  files: readonly File[],
  upload: (data: FormData) => Promise<{ ok: boolean }>,
  onProgress: (current: number, total: number) => void,
) {
  const failed: MaterialUploadFailure[] = [];
  let saved = 0;
  for (const [index, file] of files.entries()) {
    onProgress(index + 1, files.length);
    if (file.size <= 0 || !isWithinUploadLimit(file.size)) {
      failed.push({ file, reason: "size" });
      continue;
    }
    try { classifyTextSource(file.name, file.type); }
    catch { failed.push({ file, reason: "type" }); continue; }
    const data = new FormData();
    data.set("courseId", courseId);
    data.set("file", file);
    data.set("docType", categorizeByFilename(file.name) ?? "sonstiges");
    try {
      if ((await upload(data)).ok) saved++;
      else failed.push({ file, reason: "upload" });
    } catch {
      failed.push({ file, reason: "upload" });
    }
  }
  return { saved, failed };
}
