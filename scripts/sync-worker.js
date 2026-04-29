#!/usr/bin/env node

const parseArg = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const baseUrl = parseArg("baseUrl", process.env.SYNC_BASE_URL || "http://localhost:3000");
  const pollMs = Number(parseArg("pollMs", process.env.SYNC_WORKER_POLL_MS || "5000"));
  const workerId = parseArg("workerId", process.env.SYNC_WORKER_ID || `sync-worker-${process.pid}`);
  const internalSyncToken = parseArg("internalSyncToken", process.env.INTERNAL_SYNC_TOKEN || "");

  console.log(`Sync worker started: ${workerId}`);
  console.log(`Polling ${baseUrl}/api/internal/sync/jobs/process-next`);

  while (true) {
    try {
      const response = await fetch(`${baseUrl}/api/internal/sync/jobs/process-next`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalSyncToken ? { "x-internal-sync-token": internalSyncToken } : {})
        },
        body: JSON.stringify({ workerId })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.error("Worker request failed:", response.status, payload.error || response.statusText);
        await sleep(Math.max(1000, pollMs));
        continue;
      }

      if (payload.status === "idle") {
        await sleep(Math.max(1000, pollMs));
        continue;
      }

      console.log(JSON.stringify(payload, null, 2));
    } catch (error) {
      console.error("Sync worker loop failed:", error.message);
      await sleep(Math.max(1000, pollMs));
    }
  }
};

main().catch((error) => {
  console.error("Sync worker failed:", error.message);
  process.exit(1);
});
