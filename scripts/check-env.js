#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const envFiles = [".env.local", ".env.production", ".env"];

const parseEnvLine = (line) => {
  const trimmed = String(line || "").trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const idx = trimmed.indexOf("=");
  if (idx === -1) return null;
  const key = trimmed.slice(0, idx).trim();
  let value = trimmed.slice(idx + 1).trim();
  if (!key) return null;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return { key, value };
};

for (const filename of envFiles) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) continue;
  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    if (typeof process.env[parsed.key] === "undefined") {
      process.env[parsed.key] = parsed.value;
    }
  }
}

const requiredForBoot = ["DATABASE_URL"];
const recommendedForProd = [
  "NEXTAUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ALLOWED_GOOGLE_DOMAIN"
];
const optionalIntegrations = ["OPENAI_API_KEY", "VIMEO_ACCESS_TOKEN"];

const read = (name) => String(process.env[name] || "").trim();
const has = (name) => Boolean(read(name));

const isStrict = process.argv.includes("--strict");
const issues = [];

const log = (label, value) => {
  process.stdout.write(`${label}: ${value}\n`);
};

for (const key of requiredForBoot) {
  if (!has(key)) {
    issues.push(`Missing required env: ${key}`);
    log(key, "MISSING");
  } else {
    log(key, "OK");
  }
}

for (const key of recommendedForProd) {
  if (!has(key)) {
    const message = `Missing recommended env for production: ${key}`;
    issues.push(isStrict ? message : `WARN: ${message}`);
    log(key, "MISSING (recommended)");
  } else {
    log(key, "OK");
  }
}

for (const key of optionalIntegrations) {
  log(key, has(key) ? "Configured" : "Not set");
}

if (issues.length > 0) {
  process.stdout.write("\nEnvironment check results:\n");
  for (const issue of issues) {
    process.stdout.write(`- ${issue}\n`);
  }
  if (issues.some((item) => !item.startsWith("WARN:"))) {
    process.exit(1);
  }
}

process.stdout.write("\nEnvironment check passed.\n");
