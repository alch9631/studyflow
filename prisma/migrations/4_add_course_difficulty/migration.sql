-- AlterTable
-- Additive column with a default: existing rows get difficulty 3 (normal), which
-- maps to a 1.0 study-time multiplier, so every existing course plans exactly as
-- before. No data loss, no behavior change for current courses.
ALTER TABLE "Course" ADD COLUMN "difficulty" INTEGER NOT NULL DEFAULT 3;
