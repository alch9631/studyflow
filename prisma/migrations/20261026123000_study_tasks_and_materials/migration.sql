-- Additive: existing courses, uploads, notes and completed sessions are preserved.
ALTER TABLE "ModuleFile" ADD COLUMN "content" BLOB;
ALTER TABLE "Topic" ADD COLUMN "studyTask" TEXT;
ALTER TABLE "StudyBlock" ADD COLUMN "studyResult" TEXT;
