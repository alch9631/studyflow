/**
 * What we accept as uploadable study material, and how each kind becomes text.
 *
 * Split out of the upload action so the ACCEPT POLICY is a pure, testable
 * function: given a filename and browser-reported MIME type, decide how to read
 * the file — or reject it up front with a message the user can act on.
 *
 * The rule this encodes exists because the old code had no rule: anything that
 * wasn't a PDF or DOCX fell through to `buf.toString("utf-8")`, so uploading a
 * photo or a zip produced a page of mojibake, sailed past the "is it empty?"
 * check, and got spent on a real model call that could only ever return
 * nonsense. Binary in, gibberish out, one wasted request, and an error message
 * blaming the AI. Text decoding is now something a file has to qualify for.
 */

/**
 * Largest upload we accept. MUST stay in step with `serverActions.bodySizeLimit`
 * in next.config.ts: Next rejects a larger body before our action ever runs, and
 * that rejection surfaces as an unstyled framework error rather than a banner —
 * so the forms check this first and tell the user plainly.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** Human-readable form of {@link MAX_UPLOAD_BYTES}, for UI copy. */
export const MAX_UPLOAD_LABEL = "20 MB";

/**
 * `accept` attribute for every file input that feeds the analyzer. Shared so a
 * type the server can read is never missing from the picker (DOCX was handled
 * server-side for months while no form offered it) and a type it can't read is
 * never offered. Both extensions and MIME types are listed: desktop browsers
 * filter on extension, mobile share-sheets on MIME.
 */
export const UPLOAD_ACCEPT = [
  ".pdf",
  ".docx",
  ".txt",
  ".md",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
].join(",");

/** True if this file is within {@link MAX_UPLOAD_BYTES}. */
export function isWithinUploadLimit(size: number): boolean {
  return size <= MAX_UPLOAD_BYTES;
}

/**
 * A file we can't turn into text. Thrown by {@link classifyTextSource} and
 * caught by the upload action, which maps it to the `analyze-unsupported`
 * banner — distinct from "the AI failed", because nothing was ever sent.
 */
export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}

/** How a given upload should be decoded into plain text. */
export type TextSource = "pdf" | "docx" | "text";

/** Extensions we decode as UTF-8 plain text. */
const TEXT_EXTENSIONS = [".txt", ".md", ".markdown", ".text", ".csv", ".tex", ".rtf"];

/** Extensions worth a SPECIFIC hint, because the user has an obvious next step. */
const HINTED: { ext: string; hint: string }[] = [
  { ext: ".pptx", hint: "Export the slides to PDF and upload that." },
  { ext: ".ppt", hint: "Export the slides to PDF and upload that." },
  { ext: ".doc", hint: "Save it as .docx or PDF and upload that." },
  { ext: ".pages", hint: "Export it to PDF and upload that." },
  { ext: ".key", hint: "Export the slides to PDF and upload that." },
];

/**
 * Decide how to read an upload, or throw {@link UnsupportedFileError}.
 *
 * Filename extension is checked before MIME type on purpose: browsers and
 * mobile share-sheets report MIME inconsistently (a PDF can arrive as
 * `application/octet-stream`, a Markdown file as an empty string), whereas the
 * extension is whatever the user's own file is called. MIME is the fallback,
 * used only when the extension says nothing.
 */
export function classifyTextSource(filename: string, mimeType?: string | null): TextSource {
  const name = (filename ?? "").toLowerCase().trim();
  const mime = (mimeType ?? "").toLowerCase().trim();

  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (TEXT_EXTENSIONS.some((e) => name.endsWith(e))) return "text";

  const hinted = HINTED.find((h) => name.endsWith(h.ext));
  if (hinted) {
    throw new UnsupportedFileError(`${hinted.ext} files can't be read directly. ${hinted.hint}`);
  }

  // Extension told us nothing (or there isn't one) — fall back to MIME.
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (mime.startsWith("text/")) return "text";

  throw new UnsupportedFileError(
    "That file type can't be analyzed. Upload a PDF, DOCX, TXT or MD file.",
  );
}
