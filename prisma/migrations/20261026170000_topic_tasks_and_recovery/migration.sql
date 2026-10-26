ALTER TABLE "User" ADD COLUMN "recoverySnapshot" TEXT;
ALTER TABLE "Topic" ADD COLUMN "parentTopicId" TEXT REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Topic_parentTopicId_idx" ON "Topic"("parentTopicId");
