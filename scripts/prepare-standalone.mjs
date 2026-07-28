// Complete the `output: "standalone"` bundle so it can actually run.
//
// `next build` emits .next/standalone with a traced node_modules, but the trace
// is STATIC: it follows imports it can see in the source. Three things it can't
// see, and therefore leaves out:
//
//   1. .next/static and public/  — served over HTTP, never imported. Next
//      documents that you copy these yourself.
//   2. pdfjs-dist's worker       — pdf-parse loads `pdf.worker.mjs` through a
//      runtime-constructed path, so the tracer copies `pdf.mjs` and stops. The
//      standalone server then dies on the FIRST PDF upload with "Setting up
//      fake worker failed", while `next start` works fine because it resolves
//      against the full node_modules. That is a deploy-only failure in the
//      app's headline feature, invisible until a real user uploads a file.
//
// Runs automatically as `postbuild`, so a standalone bundle is never produced
// in the broken state — and VERIFIES the result rather than assuming the copy
// worked, because the whole point is that a missing file here is silent.
import { cp, access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");

const exists = async (p) => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

if (!(await exists(standalone))) {
  console.log("prepare-standalone: no .next/standalone (output isn't 'standalone') — nothing to do.");
  process.exit(0);
}

/** Packages whose runtime-loaded files the tracer misses; copied in whole. */
const FULL_COPY_PACKAGES = ["pdfjs-dist"];

/** Files that MUST exist afterwards, with why, so a regression names itself. */
const REQUIRED = [
  [".next/static", "client JS/CSS chunks — without these every page loads unstyled and dead"],
  ["public", "icons, manifest and offline assets"],
  [
    "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    "pdf-parse's worker — without it every PDF upload fails at extraction",
  ],
];

await cp(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), {
  recursive: true,
});
console.log("prepare-standalone: copied .next/static");

if (await exists(path.join(root, "public"))) {
  await cp(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
  console.log("prepare-standalone: copied public/");
}

for (const pkg of FULL_COPY_PACKAGES) {
  const from = path.join(root, "node_modules", pkg);
  const to = path.join(standalone, "node_modules", pkg);
  if (!(await exists(from))) {
    console.error(`prepare-standalone: FAILED — node_modules/${pkg} is not installed.`);
    process.exit(1);
  }
  // Remove the tracer's partial copy first so we never end up with a mix of
  // traced and full files that looks complete but isn't.
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  console.log(`prepare-standalone: copied node_modules/${pkg} in full`);
}

let ok = true;
for (const [rel, why] of REQUIRED) {
  if (!(await exists(path.join(standalone, rel)))) {
    console.error(`prepare-standalone: MISSING ${rel} — ${why}`);
    ok = false;
  }
}
if (!ok) process.exit(1);

console.log("prepare-standalone: standalone bundle verified.");
