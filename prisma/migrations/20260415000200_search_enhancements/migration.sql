-- Generated tsvector columns for metadata/transcript search
ALTER TABLE "videos" DROP COLUMN IF EXISTS "metadata_tsv";
ALTER TABLE "videos"
  ADD COLUMN "metadata_tsv" tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'english',
      coalesce("title",'') || ' ' ||
      coalesce("description",'') || ' ' ||
      coalesce("folder_name",'')
    )
  ) STORED;

ALTER TABLE "transcript_chunks" DROP COLUMN IF EXISTS "content_tsv";
ALTER TABLE "transcript_chunks"
  ADD COLUMN "content_tsv" tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("content",''))
  ) STORED;

-- Normalize tags at write-time via generated column
ALTER TABLE "video_tags" DROP COLUMN IF EXISTS "normalized_tag";
ALTER TABLE "video_tags"
  ADD COLUMN "normalized_tag" TEXT GENERATED ALWAYS AS (lower("tag")) STORED;

-- Replace tag uniqueness to use normalized value
DROP INDEX IF EXISTS "video_tags_video_id_tag_key";
CREATE UNIQUE INDEX "video_tags_video_id_normalized_tag_key"
  ON "video_tags"("video_id", "normalized_tag");

-- Transcript active/version logic
CREATE UNIQUE INDEX "transcripts_video_id_language_code_active_key"
  ON "transcripts"("video_id", "language_code")
  WHERE "is_active" = true;

-- Search indexes
CREATE INDEX "videos_metadata_tsv_gin_idx"
  ON "videos" USING GIN ("metadata_tsv");

CREATE INDEX "transcript_chunks_content_tsv_gin_idx"
  ON "transcript_chunks" USING GIN ("content_tsv");

CREATE INDEX "video_tags_normalized_tag_idx"
  ON "video_tags"("normalized_tag");

-- Retry queue optimization
DROP INDEX IF EXISTS "sync_errors_status_next_retry_at_idx";
CREATE INDEX "sync_errors_retry_queue_idx"
  ON "sync_errors"("status", "next_retry_at")
  WHERE "status" IN ('open', 'retrying');
