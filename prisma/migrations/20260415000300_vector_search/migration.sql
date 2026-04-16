-- Ensure pgvector exists (safe if already created)
CREATE EXTENSION IF NOT EXISTS vector;

-- Strong uniqueness per target for single-model MVP
CREATE UNIQUE INDEX "embeddings_video_model_unique_idx"
  ON "embeddings"("video_id", "model")
  WHERE "scope" = 'video_metadata' AND "video_id" IS NOT NULL;

CREATE UNIQUE INDEX "embeddings_chunk_model_unique_idx"
  ON "embeddings"("transcript_chunk_id", "model")
  WHERE "scope" = 'transcript_chunk' AND "transcript_chunk_id" IS NOT NULL;

CREATE INDEX "embeddings_scope_model_idx"
  ON "embeddings"("scope", "model");

-- ANN vector indexes (cosine distance)
-- Tune lists/probes as data volume grows.
CREATE INDEX "embeddings_video_ivfflat_cos_idx"
  ON "embeddings"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100)
  WHERE "scope" = 'video_metadata';

CREATE INDEX "embeddings_chunk_ivfflat_cos_idx"
  ON "embeddings"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 200)
  WHERE "scope" = 'transcript_chunk';
