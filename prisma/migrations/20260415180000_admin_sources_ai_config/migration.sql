ALTER TYPE "source_status" ADD VALUE IF NOT EXISTS 'syncing';

ALTER TABLE "data_sources"
  ADD COLUMN IF NOT EXISTS "vimeo_client_id" TEXT,
  ADD COLUMN IF NOT EXISTS "vimeo_client_secret_encrypted" TEXT;

ALTER TABLE "data_sources"
  ALTER COLUMN "access_token_encrypted" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "ai_configs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "singleton" BOOLEAN NOT NULL DEFAULT true,
  "openai_api_key_encrypted" TEXT,
  "openai_key_last4" VARCHAR(8),
  "embedding_model" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  "explanation_model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  "match_sensitivity" DECIMAL(4,3) NOT NULL DEFAULT 0.650,
  "match_reason_prompt" TEXT NOT NULL DEFAULT 'In one short, punchy sentence, explain to a salesperson why this video is a good match for the client brief. Start with ''Matches because...''',
  "auto_sync_embeddings" BOOLEAN NOT NULL DEFAULT true,
  "updated_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_configs_singleton_key" ON "ai_configs"("singleton");
CREATE INDEX IF NOT EXISTS "ai_configs_updated_by_user_id_idx" ON "ai_configs"("updated_by_user_id");

ALTER TABLE "ai_configs"
  ADD CONSTRAINT "ai_configs_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "ai_configs" ("singleton")
SELECT true
WHERE NOT EXISTS (SELECT 1 FROM "ai_configs" WHERE "singleton" = true);
