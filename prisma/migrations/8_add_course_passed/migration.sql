-- AlterTable
-- "Modul bestanden (ohne Note)" — an UNGRADED pass for German unbenotete
-- (pass/fail) modules, which the 1.0–5.0 `grade` column cannot express.
-- NOT NULL with DEFAULT false, so every existing course stays valid as-is and
-- nothing changes until a student ticks the checkbox. Works on both SQLite and
-- Postgres (BOOLEAN maps cleanly on either).
ALTER TABLE "Course" ADD COLUMN "passed" BOOLEAN NOT NULL DEFAULT false;
