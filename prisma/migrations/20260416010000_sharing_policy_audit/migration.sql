ALTER TABLE "shortlists"
  ADD COLUMN IF NOT EXISTS "share_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "share_last_accessed_at" TIMESTAMPTZ(6);

CREATE TABLE IF NOT EXISTS "shortlist_share_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shortlist_id" UUID NOT NULL,
  "actor_user_id" UUID,
  "action" TEXT NOT NULL,
  "detail" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "shortlist_share_audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shortlist_share_audit_logs_shortlist_id_fkey"
    FOREIGN KEY ("shortlist_id") REFERENCES "shortlists"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "shortlist_share_audit_logs_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "shortlist_share_audit_logs_shortlist_id_created_at_idx"
  ON "shortlist_share_audit_logs"("shortlist_id", "created_at");

CREATE INDEX IF NOT EXISTS "shortlist_share_audit_logs_action_created_at_idx"
  ON "shortlist_share_audit_logs"("action", "created_at");
