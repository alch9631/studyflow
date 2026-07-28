/**
 * Tests for the upload accept policy. Run: npx tsx src/lib/fileText.test.ts
 *
 * classifyTextSource is the gate that decides whether an upload becomes text at
 * all. The regression it guards: everything unrecognised used to fall through to
 * a UTF-8 decode, so a JPEG or a ZIP turned into mojibake, passed the "is it
 * empty?" check, and was spent on a real model call that could only return
 * nonsense — reported to the student as an AI failure. A file now has to
 * QUALIFY for text decoding; anything else is rejected before a byte is read.
 *
 * Pure and network-free: no file is opened, no model is called.
 */
import {
  classifyTextSource,
  UnsupportedFileError,
  isWithinUploadLimit,
  MAX_UPLOAD_BYTES,
  UPLOAD_ACCEPT,
} from "./fileText";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`);
  }
}
/** True if fn() throws UnsupportedFileError whose message matches re. */
function rejects(fn: () => unknown, re: RegExp): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof UnsupportedFileError && re.test(e.message);
  }
}

// ── the supported kinds ──────────────────────────────────────────────────────
check("pdf by extension", classifyTextSource("skript.pdf", "") === "pdf");
check("pdf by extension, uppercase", classifyTextSource("SKRIPT.PDF", "") === "pdf");
check("docx by extension", classifyTextSource("notes.docx", "") === "docx");
check("txt by extension", classifyTextSource("notes.txt", "") === "text");
check("md by extension", classifyTextSource("README.md", "") === "text");
check("markdown by extension", classifyTextSource("a.markdown", "") === "text");
check("csv by extension", classifyTextSource("grades.csv", "") === "text");
check("tex by extension", classifyTextSource("thesis.tex", "") === "text");

// Extension beats MIME on purpose: browsers and mobile share-sheets report MIME
// inconsistently, and a PDF arriving as application/octet-stream is routine.
check(
  "extension wins over a wrong/blank MIME",
  classifyTextSource("skript.pdf", "application/octet-stream") === "pdf",
);
check("extension wins over a lying MIME", classifyTextSource("notes.md", "image/png") === "text");

// ── MIME fallback when the name says nothing ─────────────────────────────────
check("pdf by MIME when extensionless", classifyTextSource("scan", "application/pdf") === "pdf");
check(
  "docx by MIME when extensionless",
  classifyTextSource("doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document") === "docx",
);
check("text/* by MIME when extensionless", classifyTextSource("notes", "text/plain") === "text");
check("text/markdown by MIME", classifyTextSource("notes", "text/markdown") === "text");
check("MIME matched case-insensitively", classifyTextSource("scan", "APPLICATION/PDF") === "pdf");

// ── the rejections (the actual bug this module exists for) ───────────────────
check("jpeg is rejected, not decoded", rejects(() => classifyTextSource("photo.jpg", "image/jpeg"), /can't be analyzed/));
check("png is rejected", rejects(() => classifyTextSource("scan.png", "image/png"), /can't be analyzed/));
check("zip is rejected", rejects(() => classifyTextSource("kurs.zip", "application/zip"), /can't be analyzed/));
check("exe is rejected", rejects(() => classifyTextSource("setup.exe", ""), /can't be analyzed/));
check("unknown MIME + no extension is rejected", rejects(() => classifyTextSource("blob", "application/octet-stream"), /can't be analyzed/));
check("empty filename and MIME is rejected", rejects(() => classifyTextSource("", ""), /can't be analyzed/));

// Types with an obvious next step get that step named, rather than the generic
// list — the user has the source file and can export it in one action.
check("pptx names the PDF export", rejects(() => classifyTextSource("vorlesung.pptx", ""), /Export the slides to PDF/));
check("ppt names the PDF export", rejects(() => classifyTextSource("old.ppt", ""), /Export the slides to PDF/));
check("legacy .doc names the save-as", rejects(() => classifyTextSource("alt.doc", ""), /Save it as \.docx or PDF/));
check("keynote names the PDF export", rejects(() => classifyTextSource("deck.key", ""), /Export the slides to PDF/));
check(
  "a hinted type is rejected even with a text/* MIME",
  rejects(() => classifyTextSource("deck.pptx", "text/plain"), /Export the slides to PDF/),
);
check(
  "rejections are UnsupportedFileError (so the action can tell them from AI failures)",
  rejects(() => classifyTextSource("x.bin", ""), /./),
);

// ── size limit ───────────────────────────────────────────────────────────────
check("a small file is within the limit", isWithinUploadLimit(1_000));
check("exactly the limit is allowed", isWithinUploadLimit(MAX_UPLOAD_BYTES));
check("one byte over is rejected", !isWithinUploadLimit(MAX_UPLOAD_BYTES + 1));
check("zero bytes is within the limit (emptiness is checked elsewhere)", isWithinUploadLimit(0));

// ── accept attribute stays in step with what the server can read ─────────────
// The DOCX case is the one that actually drifted: handled server-side for months
// while no picker offered it.
check("accept offers pdf", UPLOAD_ACCEPT.includes(".pdf"));
check("accept offers docx", UPLOAD_ACCEPT.includes(".docx"));
check("accept offers txt and md", UPLOAD_ACCEPT.includes(".txt") && UPLOAD_ACCEPT.includes(".md"));
check(
  "every extension offered by the picker is actually readable",
  UPLOAD_ACCEPT.split(",")
    .filter((a) => a.startsWith("."))
    .every((ext) => {
      try {
        classifyTextSource(`file${ext}`, "");
        return true;
      } catch {
        return false;
      }
    }),
);
check(
  "every MIME offered by the picker is actually readable",
  UPLOAD_ACCEPT.split(",")
    .filter((a) => !a.startsWith("."))
    .every((mime) => {
      try {
        classifyTextSource("file", mime);
        return true;
      } catch {
        return false;
      }
    }),
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
