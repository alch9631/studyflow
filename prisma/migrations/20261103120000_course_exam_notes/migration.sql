-- Additive: module notes stay separate from topic notes and scheduling data.
ALTER TABLE "Course" ADD COLUMN "examNote" TEXT;
ALTER TABLE "Course" ADD COLUMN "examNoteUpdatedAt" DATETIME;
