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

  const response = await fetch(`${baseUrl}/api/internal/sync/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dataSourceId,
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
