import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Read at request time so an old, open app can detect the next release. */
export async function readBuildId(): Promise<string | null> {
  try {
    return (await readFile(join(process.cwd(), ".next", "BUILD_ID"), "utf8")).trim() || null;
  } catch {
    return null; // Development / a build still in progress.
  }
}
