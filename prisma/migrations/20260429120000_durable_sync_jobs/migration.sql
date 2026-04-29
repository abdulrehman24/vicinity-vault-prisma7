ALTER TYPE "sync_error_stage" ADD VALUE IF NOT EXISTS 'categorize';

CREATE TYPE "sync_job_type" AS ENUM ('vimeo_sync', 'retry_failed_videos', 'embedding_rebuild');

CREATE TYPE "sync_job_status" AS ENUM ('queued', 'running', 'success', 'partial', 'failed', 'cancelled');

CREATE TYPE "sync_run_video_status" AS ENUM ('queued', 'running', 'success', 'failed', 'skipped');

CREATE TABLE "sync_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sync_run_id" UUID,
    "data_source_id" UUID,
    "job_type" "sync_job_type" NOT NULL DEFAULT 'vimeo_sync',
    "status" "sync_job_status" NOT NULL DEFAULT 'queued',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sync_run_videos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sync_run_id" UUID NOT NULL,
    "data_source_id" UUID NOT NULL,
    "video_id" UUID,
    "vimeo_video_id" TEXT NOT NULL,
    "status" "sync_run_video_status" NOT NULL DEFAULT 'queued',
    "stage" "sync_error_stage",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_run_videos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_jobs_status_created_at_idx" ON "sync_jobs"("status", "created_at");
CREATE INDEX "sync_jobs_locked_at_idx" ON "sync_jobs"("locked_at");
CREATE INDEX "sync_jobs_sync_run_id_idx" ON "sync_jobs"("sync_run_id");
CREATE INDEX "sync_jobs_data_source_id_idx" ON "sync_jobs"("data_source_id");

CREATE UNIQUE INDEX "sync_run_videos_sync_run_id_vimeo_video_id_key" ON "sync_run_videos"("sync_run_id", "vimeo_video_id");
CREATE INDEX "sync_run_videos_sync_run_id_status_idx" ON "sync_run_videos"("sync_run_id", "status");
CREATE INDEX "sync_run_videos_data_source_id_idx" ON "sync_run_videos"("data_source_id");
CREATE INDEX "sync_run_videos_video_id_idx" ON "sync_run_videos"("video_id");
CREATE INDEX "sync_run_videos_vimeo_video_id_idx" ON "sync_run_videos"("vimeo_video_id");

ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sync_run_videos" ADD CONSTRAINT "sync_run_videos_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sync_run_videos" ADD CONSTRAINT "sync_run_videos_data_source_id_fkey" FOREIGN KEY ("data_source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sync_run_videos" ADD CONSTRAINT "sync_run_videos_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
