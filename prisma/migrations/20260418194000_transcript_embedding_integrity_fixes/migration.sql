-- Relax old strict-target checks and replace with new checks that require:
-- - video_metadata embeddings: video_id only
-- - transcript_chunk embeddings: transcript_chunk_id + video_id
ALTER TABLE "embeddings" DROP CONSTRAINT IF EXISTS "embeddings_exactly_one_target_chk";
ALTER TABLE "embeddings" DROP CONSTRAINT IF EXISTS "embeddings_scope_target_chk";

-- Backfill transcript-chunk embeddings with video_id from transcript_chunks
UPDATE "embeddings" e
SET "video_id" = tc."video_id"
FROM "transcript_chunks" tc
WHERE e."scope" = 'transcript_chunk'::"embedding_scope"
  AND e."transcript_chunk_id" = tc."id"
  AND e."video_id" IS NULL;

ALTER TABLE "embeddings"
  ADD CONSTRAINT "embeddings_scope_target_chk"
  CHECK (
    (scope = 'video_metadata' AND video_id IS NOT NULL AND transcript_chunk_id IS NULL)
    OR
    (scope = 'transcript_chunk' AND transcript_chunk_id IS NOT NULL AND video_id IS NOT NULL)
  );
