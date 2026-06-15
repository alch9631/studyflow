-- AlterTable
-- Additive, nullable column: existing rows stay NULL (unclassified). No data loss.
ALTER TABLE "ModuleFile" ADD COLUMN "category" TEXT;
