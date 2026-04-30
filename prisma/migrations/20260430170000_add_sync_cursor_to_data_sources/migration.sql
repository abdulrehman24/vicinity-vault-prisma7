ALTER TABLE "data_sources"
  ADD COLUMN IF NOT EXISTS "sync_cursor_page" INTEGER,
  ADD COLUMN IF NOT EXISTS "sync_cursor_vimeo_id" TEXT,
  ADD COLUMN IF NOT EXISTS "sync_cursor_published_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "sync_cursor_updated_at" TIMESTAMPTZ(6);
