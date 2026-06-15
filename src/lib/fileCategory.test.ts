/**
 * Tests for the uploaded-file auto-classifier. Run: npx tsx src/lib/fileCategory.test.ts
 *
 * Pure functions (no DB / no AI), so every case is deterministic. Covers the
 * German + English filename heuristics, rule precedence on overlapping keywords,
 * the AI-category fallback, and junk-input safety.
 */
import {
  categorizeByFilename,
  classifyFile,
  isFileCategory,
  FILE_CATEGORIES,
} from "./fileCategory";

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

// ── categorizeByFilename: German naming ──────────────────────────────────────
check("Übungsblatt → uebung", categorizeByFilename("Übungsblatt_3.pdf") === "uebung");
check("uebung (ascii) → uebung", categorizeByFilename("uebung04.pdf") === "uebung");
check("Aufgaben → uebung", categorizeByFilename("Aufgaben_Woche2.pdf") === "uebung");
check("Altklausur → altklausur", categorizeByFilename("Altklausur_WS2021.pdf") === "altklausur");
check("Probeklausur → mockexam", categorizeByFilename("Probeklausur.pdf") === "mockexam");
check("Folien → slides", categorizeByFilename("VL05_Folien.pdf") === "slides");
check("Vorlesung → slides", categorizeByFilename("Vorlesung_Kapitel1.pdf") === "slides");
check("Skript → skript", categorizeByFilename("Skript_komplett.pdf") === "skript");

// ── categorizeByFilename: English naming ─────────────────────────────────────
check("sheet → uebung", categorizeByFilename("exercise_sheet_2.pdf") === "uebung");
check("homework → uebung", categorizeByFilename("homework1.pdf") === "uebung");
check("slides → slides", categorizeByFilename("week3-slides.pdf") === "slides");
check("script → skript", categorizeByFilename("full_script.pdf") === "skript");
check("notes → skript", categorizeByFilename("LectureNotes.pdf") === "skript");
check("mock exam → mockexam", categorizeByFilename("mock-exam-final.pdf") === "mockexam");

// ── precedence on overlaps ───────────────────────────────────────────────────
// "probeklausur" contains "klausur" but mock must win.
check("Probeklausur not misread as altklausur", categorizeByFilename("Probeklausur_2020.pdf") === "mockexam");
// "altklausur" must beat the generic "klausur"/"exam".
check("Altklausur beats generic klausur", categorizeByFilename("Altklausur.pdf") === "altklausur");

// ── no match ─────────────────────────────────────────────────────────────────
check("unknown filename → null", categorizeByFilename("random_document.pdf") === null);
check("empty filename → null", categorizeByFilename("") === null);

// ── classifyFile: filename wins, AI fallback, junk ignored ────────────────────
check("filename wins over AI", classifyFile("Übungsblatt.pdf", "skript") === "uebung");
check("AI used when filename ambiguous", classifyFile("doc.pdf", "skript") === "skript");
check("junk AI ignored", classifyFile("doc.pdf", "garbage") === null);
check("no signals → null", classifyFile("doc.pdf", null) === null);

// ── isFileCategory ───────────────────────────────────────────────────────────
check("isFileCategory accepts known", FILE_CATEGORIES.every(isFileCategory));
check("isFileCategory rejects junk", !isFileCategory("nope"));
check("isFileCategory rejects non-string", !isFileCategory(42));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
