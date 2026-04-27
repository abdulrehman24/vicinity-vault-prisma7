import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";

const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "sync-process.log");
const syncFileLoggingEnabled = Boolean(env.enableSyncFileLogs);

const ensureLogFile = () => {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, "");
  }
};

const serializeMeta = (meta) => {
  if (!meta || typeof meta !== "object") return "";
  try {
    return JSON.stringify(meta);
  } catch {
    return JSON.stringify({ meta: "unserializable" });
  }
};

const writeLine = (line) => {
  if (!syncFileLoggingEnabled) return;
  ensureLogFile();
  fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
};

const safeMeta = (meta = {}) => {
  const copy = { ...meta };
  delete copy.accessToken;
  delete copy.token;
  delete copy.apiKey;
  return copy;
};

export const createSyncLogger = (baseContext = {}) => {
  const context = safeMeta(baseContext);

  const log = (level, message, meta = {}) => {
    const timestamp = new Date().toISOString();
    const payload = {
      ...context,
      ...safeMeta(meta)
    };
    const line = `[${timestamp}] [${level.toUpperCase()}] ${message}${
      Object.keys(payload).length ? ` | ${serializeMeta(payload)}` : ""
    }`;
    writeLine(line);

    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    fn(`[sync] ${message}`, payload);
  };

  return {
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
    debug: (message, meta) => log("debug", message, meta),
    child: (extra = {}) => createSyncLogger({ ...context, ...safeMeta(extra) }),
    filePath: syncFileLoggingEnabled ? LOG_FILE : null
  };
};

export const syncLogFilePath = syncFileLoggingEnabled ? LOG_FILE : null;
