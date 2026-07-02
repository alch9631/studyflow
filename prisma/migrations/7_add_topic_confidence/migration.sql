-- AlterTable
-- Student self-rated confidence per topic: "solid" | "practice" | "struggling"
-- (string union, no DB enum — the schema stays Postgres-portable). Nullable, so
-- every existing topic stays valid as-is (null = unrated) — no data loss, no
-- behavior change until a student rates a topic.
ALTER TABLE "Topic" ADD COLUMN "confidence" TEXT;
