/** One request per original; a failure never prevents later files from saving. */
export async function uploadBatch<T>(items: readonly T[], upload: (item: T) => Promise<void>, onProgress: (current: number, total: number) => void) {
  const failed: { item: T; message: string }[] = [];
  let saved = 0;
  for (const [index, item] of items.entries()) {
    onProgress(index + 1, items.length);
    try { await upload(item); saved++; }
    catch (error) { failed.push({ item, message: error instanceof Error ? error.message : "Couldn't upload this file." }); }
  }
  return { saved, failed };
}
