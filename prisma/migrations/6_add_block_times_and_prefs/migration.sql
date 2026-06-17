-- AlterTable
-- Optional time-of-day scheduling for study blocks. Both nullable, so every
-- existing block (planned day-granular) stays valid as-is — no data loss, no
-- behavior change. They pin a block to a concrete start/end on its `date` when
-- set; null/null keeps the block day-granular (the current behaviour).
ALTER TABLE "StudyBlock" ADD COLUMN "startTime" DATETIME;
ALTER TABLE "StudyBlock" ADD COLUMN "endTime" DATETIME;

-- AlterTable
-- Focus/scheduling preferences stored as a JSON string (not a Json column — the
-- schema stays Postgres-portable / sqlite-native). Nullable, so existing users
-- (incl. the dev user) are valid as-is. null = unset.
ALTER TABLE "User" ADD COLUMN "preferences" TEXT;

-- CreateIndex
CREATE INDEX "StudyBlock_courseId_startTime_idx" ON "StudyBlock"("courseId", "startTime");
