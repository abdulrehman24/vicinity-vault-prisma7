CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "source_platform" AS ENUM ('vimeo');

-- CreateEnum
CREATE TYPE "source_status" AS ENUM ('connected', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "video_status" AS ENUM ('active', 'archived', 'deleted');

-- CreateEnum
CREATE TYPE "transcript_source" AS ENUM ('vimeo', 'openai');

-- CreateEnum
CREATE TYPE "transcript_status" AS ENUM ('pending', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "embedding_scope" AS ENUM ('video_metadata', 'transcript_chunk');

-- CreateEnum
CREATE TYPE "embedding_model" AS ENUM ('text_embedding_3_small');

-- CreateEnum
CREATE TYPE "shortlist_visibility" AS ENUM ('private', 'team', 'shared_link');

-- CreateEnum
CREATE TYPE "sync_run_trigger" AS ENUM ('manual', 'scheduled', 'retry', 'webhook');

-- CreateEnum
CREATE TYPE "sync_run_status" AS ENUM ('queued', 'running', 'success', 'partial', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "sync_error_stage" AS ENUM ('fetch_metadata', 'fetch_transcript', 'chunk_transcript', 'embed', 'upsert');

-- CreateEnum
CREATE TYPE "sync_error_status" AS ENUM ('open', 'retrying', 'resolved', 'ignored');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_initials" VARCHAR(8),
    "role" "user_role" NOT NULL DEFAULT 'user',
    "sso_provider" TEXT,
    "sso_subject" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "platform" "source_platform" NOT NULL DEFAULT 'vimeo',
    "account_uri" TEXT,
    "access_token_encrypted" TEXT NOT NULL,
    "status" "source_status" NOT NULL DEFAULT 'connected',
    "last_sync_at" TIMESTAMPTZ(6),
    "video_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "data_source_id" UUID NOT NULL,
    "vimeo_video_id" TEXT NOT NULL,
    "vimeo_uri" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "duration_seconds" INTEGER,
    "thumbnail_url" TEXT,
    "video_url" TEXT NOT NULL,
    "folder_name" TEXT,
    "language_code" VARCHAR(16),
    "privacy_view" TEXT,
    "status" "video_status" NOT NULL DEFAULT 'active',
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "metadata_tsv" tsvector,
    "published_at" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_tags" (
    "id" BIGSERIAL NOT NULL,
    "video_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "normalized_tag" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" BIGSERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_categories" (
    "video_id" UUID NOT NULL,
    "category_id" BIGINT NOT NULL,
    "confidence" DECIMAL(5,4),

    CONSTRAINT "video_categories_pkey" PRIMARY KEY ("video_id","category_id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "video_id" UUID NOT NULL,
    "source" "transcript_source" NOT NULL,
    "status" "transcript_status" NOT NULL DEFAULT 'pending',
    "language_code" VARCHAR(16) NOT NULL DEFAULT 'en',
    "provider_asset_id" TEXT,
    "raw_text" TEXT,
    "error_message" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "generated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcript_chunks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transcript_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "start_seconds" DECIMAL(10,3),
    "end_seconds" DECIMAL(10,3),
    "token_count" INTEGER,
    "content" TEXT NOT NULL,
    "content_tsv" tsvector,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transcript_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "embedding_scope" NOT NULL,
    "model" "embedding_model" NOT NULL DEFAULT 'text_embedding_3_small',
    "embedding" vector(1536) NOT NULL,
    "video_id" UUID,
    "transcript_chunk_id" UUID,
    "checksum" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favourites" (
    "user_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourites_pkey" PRIMARY KEY ("user_id","video_id")
);

-- CreateTable
CREATE TABLE "shortlists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "shortlist_visibility" NOT NULL DEFAULT 'private',
    "share_token" UUID,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shortlist_items" (
    "shortlist_id" UUID NOT NULL,
    "video_id" UUID NOT NULL,
    "added_by_user_id" UUID,
    "position" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shortlist_items_pkey" PRIMARY KEY ("shortlist_id","video_id")
);

-- CreateTable
CREATE TABLE "sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "data_source_id" UUID NOT NULL,
    "initiated_by_user_id" UUID,
    "trigger" "sync_run_trigger" NOT NULL DEFAULT 'manual',
    "status" "sync_run_status" NOT NULL DEFAULT 'queued',
    "retry_of_run_id" UUID,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "videos_scanned" INTEGER NOT NULL DEFAULT 0,
    "videos_created" INTEGER NOT NULL DEFAULT 0,
    "videos_updated" INTEGER NOT NULL DEFAULT 0,
    "videos_deleted" INTEGER NOT NULL DEFAULT 0,
    "transcripts_processed" INTEGER NOT NULL DEFAULT 0,
    "embeddings_created" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_errors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sync_run_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "video_id" UUID,
    "stage" "sync_error_stage" NOT NULL,
    "status" "sync_error_status" NOT NULL DEFAULT 'open',
    "error_code" TEXT,
    "error_message" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_sso_provider_sso_subject_key" ON "users"("sso_provider", "sso_subject");

-- CreateIndex
CREATE INDEX "data_sources_status_idx" ON "data_sources"("status");

-- CreateIndex
CREATE UNIQUE INDEX "videos_vimeo_video_id_key" ON "videos"("vimeo_video_id");

-- CreateIndex
CREATE UNIQUE INDEX "videos_vimeo_uri_key" ON "videos"("vimeo_uri");

-- CreateIndex
CREATE INDEX "videos_data_source_id_idx" ON "videos"("data_source_id");

-- CreateIndex
CREATE INDEX "videos_status_idx" ON "videos"("status");

-- CreateIndex
CREATE INDEX "videos_published_at_idx" ON "videos"("published_at");

-- CreateIndex
CREATE INDEX "video_tags_video_id_idx" ON "video_tags"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_tags_video_id_tag_key" ON "video_tags"("video_id", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "video_categories_category_id_idx" ON "video_categories"("category_id");

-- CreateIndex
CREATE INDEX "transcripts_video_id_is_active_idx" ON "transcripts"("video_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "transcripts_video_id_source_language_code_version_key" ON "transcripts"("video_id", "source", "language_code", "version");

-- CreateIndex
CREATE INDEX "transcript_chunks_video_id_idx" ON "transcript_chunks"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "transcript_chunks_transcript_id_chunk_index_key" ON "transcript_chunks"("transcript_id", "chunk_index");

-- CreateIndex
CREATE INDEX "embeddings_scope_idx" ON "embeddings"("scope");

-- CreateIndex
CREATE INDEX "favourites_video_id_idx" ON "favourites"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "shortlists_share_token_key" ON "shortlists"("share_token");

-- CreateIndex
CREATE INDEX "shortlists_owner_user_id_idx" ON "shortlists"("owner_user_id");

-- CreateIndex
CREATE INDEX "shortlists_visibility_idx" ON "shortlists"("visibility");

-- CreateIndex
CREATE INDEX "shortlist_items_video_id_idx" ON "shortlist_items"("video_id");

-- CreateIndex
CREATE UNIQUE INDEX "shortlist_items_shortlist_id_position_key" ON "shortlist_items"("shortlist_id", "position");

-- CreateIndex
CREATE INDEX "sync_runs_data_source_id_created_at_idx" ON "sync_runs"("data_source_id", "created_at");

-- CreateIndex
CREATE INDEX "sync_runs_status_idx" ON "sync_runs"("status");

-- CreateIndex
CREATE INDEX "sync_errors_sync_run_id_idx" ON "sync_errors"("sync_run_id");

-- CreateIndex
CREATE INDEX "sync_errors_data_source_id_idx" ON "sync_errors"("data_source_id");

-- CreateIndex
CREATE INDEX "sync_errors_status_next_retry_at_idx" ON "sync_errors"("status", "next_retry_at");

-- AddForeignKey
ALTER TABLE "data_sources" ADD CONSTRAINT "data_sources_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_tags" ADD CONSTRAINT "video_tags_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_categories" ADD CONSTRAINT "video_categories_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_categories" ADD CONSTRAINT "video_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_chunks" ADD CONSTRAINT "transcript_chunks_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "transcripts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcript_chunks" ADD CONSTRAINT "transcript_chunks_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_transcript_chunk_id_fkey" FOREIGN KEY ("transcript_chunk_id") REFERENCES "transcript_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlists" ADD CONSTRAINT "shortlists_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_shortlist_id_fkey" FOREIGN KEY ("shortlist_id") REFERENCES "shortlists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shortlist_items" ADD CONSTRAINT "shortlist_items_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_initiated_by_user_id_fkey" FOREIGN KEY ("initiated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_retry_of_run_id_fkey" FOREIGN KEY ("retry_of_run_id") REFERENCES "sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_errors" ADD CONSTRAINT "sync_errors_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_errors" ADD CONSTRAINT "sync_errors_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_errors" ADD CONSTRAINT "sync_errors_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Embedding target integrity checks (Prisma is weak here)
ALTER TABLE "embeddings"
  ADD CONSTRAINT "embeddings_exactly_one_target_chk"
  CHECK (
    (video_id IS NOT NULL AND transcript_chunk_id IS NULL)
    OR
    (video_id IS NULL AND transcript_chunk_id IS NOT NULL)
  );

ALTER TABLE "embeddings"
  ADD CONSTRAINT "embeddings_scope_target_chk"
  CHECK (
    (scope = 'video_metadata' AND video_id IS NOT NULL AND transcript_chunk_id IS NULL)
    OR
    (scope = 'transcript_chunk' AND transcript_chunk_id IS NOT NULL AND video_id IS NULL)
  );

