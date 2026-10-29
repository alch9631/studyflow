import assert from "node:assert/strict";
import { uploadMaterialFiles } from "./materialUploadQueue";
import { MAX_UPLOAD_BYTES } from "./fileText";
import { categorizeByFilename } from "./fileCategory";

async function main() {
  const files = [new File(["lecture"], "Skript_1.txt"), new File(["exercise"], "Übung_2.md"), new File(["notes"], "Notes.txt")];
  const sent: string[] = [];
  const progress: number[][] = [];
  let active = 0;
  const first = await uploadMaterialFiles("owned-course", files, async (data) => {
    assert.equal(++active, 1, "Uploads must be sequential");
    await Promise.resolve();
    assert.equal(data.get("courseId"), "owned-course");
    assert.equal(data.getAll("file").length, 1, "Each request contains just one file");
    const file = data.get("file") as File;
    assert.equal(data.get("docType"), categorizeByFilename(file.name) ?? "sonstiges");
    sent.push(file.name);
    active--;
    return { ok: file.name !== files[1].name };
  }, (...value) => progress.push(value));
  assert.deepEqual(sent, files.map((file) => file.name));
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  assert.equal(first.saved, 2);
  assert.deepEqual(first.failed, [{ file: files[1], reason: "upload" }]);
  console.log("✓ Multiple files retain their course, name and individual category in sequential requests");
  console.log("✓ A failed file does not stop later files; progress counts the complete selection");

  sent.length = 0;
  const retry = await uploadMaterialFiles("owned-course", first.failed.map(({ file }) => file), async (data) => {
    sent.push((data.get("file") as File).name);
    return { ok: true };
  }, () => {});
  assert.deepEqual(sent, [files[1].name]);
  assert.equal(retry.saved, 1);
  assert.equal(retry.failed.length, 0);
  console.log("✓ Retry sends only failed originals and never duplicates successful uploads");

  const invalid = [new File([], "empty.txt"), new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "large.pdf"), new File(["zip"], "archive.zip")];
  let requests = 0;
  const rejected = await uploadMaterialFiles("course", [...invalid, files[0], files[2]], async () => {
    requests++;
    if (requests === 1) throw new Error("Offline");
    return { ok: true };
  }, () => {});
  assert.equal(requests, 2, "Invalid files never reach the server");
  assert.equal(rejected.saved, 1);
  assert.deepEqual(rejected.failed.map(({ reason }) => reason), ["size", "size", "type", "upload"]);
  console.log("✓ Empty, oversized and unsupported files are named failures; network errors allow later files to continue");

  const big = [new File([new Uint8Array(12 * 1024 * 1024)], "one.txt"), new File([new Uint8Array(12 * 1024 * 1024)], "two.txt")];
  assert.ok(big.reduce((size, file) => size + file.size, 0) > 22 * 1024 * 1024);
  const largeBatch = await uploadMaterialFiles("course", big, async (data) => {
    assert.equal((data.get("file") as File).size, 12 * 1024 * 1024);
    assert.equal(data.getAll("file").length, 1);
    return { ok: true };
  }, () => {});
  assert.equal(largeBatch.saved, 2);
  assert.equal(largeBatch.failed.length, 0);
  console.log("✓ A selection larger than the request limit works without increasing the 20 MB per-file limit");

  const empty = await uploadMaterialFiles("course", [], async () => { throw new Error("Unexpected upload"); }, () => {});
  assert.deepEqual(empty, { saved: 0, failed: [] });
  console.log("✓ Empty selections create no requests");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
