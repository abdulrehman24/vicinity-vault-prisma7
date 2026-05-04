CREATE TABLE "search_history" (
  "id" BIGSERIAL NOT NULL,
  "user_id" UUID NOT NULL,
  "query" TEXT NOT NULL,
  "normalized_query" TEXT NOT NULL,
  "result_count" INTEGER NOT NULL DEFAULT 0,
  "search_count" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "search_history_user_id_normalized_query_key"
  ON "search_history"("user_id", "normalized_query");

CREATE INDEX "search_history_user_id_updated_at_idx"
  ON "search_history"("user_id", "updated_at" DESC);

ALTER TABLE "search_history"
  ADD CONSTRAINT "search_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
