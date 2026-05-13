#!/usr/bin/env node

const parseArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const main = async () => {
  const baseUrl = parseArg("baseUrl", process.env.SYNC_BASE_URL || "http://localhost:3000");
  const dataSourceId = parseArg("dataSourceId", null);
  const perPage = Number(parseArg("perPage", "50"));
  const maxPages = Number(parseArg("maxPages", "0"));
  const testVideoLimit = Number(parseArg("testVideoLimit", ""));
  const runTypeTag = parseArg("runTypeTag", "baseline_full_sync");
  const trigger = parseArg("trigger", "manual");
  const schedulerSecret = parseArg("schedulerSecret", process.env.SYNC_SCHEDULER_SECRET || "");
  const useScheduledEndpoint = String(parseArg("scheduledEndpoint", "false")).toLowerCase() === "true";
  const endpoint = useScheduledEndpoint
    ? runTypeTag === "delete_only_reconcile"
      ? "/api/internal/sync/scheduled/delete"
      : "/api/internal/sync/scheduled/sync-new"
    : "/api/internal/sync/videos";

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(schedulerSecret ? { "x-sync-scheduler-secret": schedulerSecret } : {})
    },
    body: JSON.stringify({
      dataSourceId,
      runTypeTag,
      trigger,
      perPage: Number.isFinite(perPage) ? perPage : 50,
      maxPages: Number.isFinite(maxPages) ? maxPages : 0,
      testVideoLimit: Number.isFinite(testVideoLimit) ? testVideoLimit : null
    })
  });

  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));
  if (!response.ok) {
    process.exit(1);
  }
};

main().catch((error) => {
  console.error("Sync trigger failed:", error.message);
  process.exit(1);
});
