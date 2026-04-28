import fs from "node:fs";
import { promises as fsp } from "node:fs";
import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { syncLogFilePath } from "@/src/server/logging/sync-logger";

export const runtime = "nodejs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);

    if (!syncLogFilePath) {
      return NextResponse.json({
        enabled: false,
        lines: [],
        lineCount: 0,
        filePath: null,
        message: "Sync file logging is disabled. Enable ENABLE_SYNC_FILE_LOGS to view logs."
      });
    }

    if (!fs.existsSync(syncLogFilePath)) {
      return NextResponse.json({
        enabled: true,
        lines: [],
        lineCount: 0,
        filePath: syncLogFilePath,
        message: "Log file not created yet. Run a sync to generate logs."
      });
    }

    const url = new URL(request.url);
    const requestedLines = Number(url.searchParams.get("lines") || 150);
    const requestedMaxBytes = Number(url.searchParams.get("maxBytes") || 262144);
    const linesLimit = clamp(Number.isFinite(requestedLines) ? requestedLines : 150, 20, 500);
    const maxBytes = clamp(Number.isFinite(requestedMaxBytes) ? requestedMaxBytes : 262144, 32768, 1048576);

    const stat = await fsp.stat(syncLogFilePath);
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const handle = await fsp.open(syncLogFilePath, "r");
    const buffer = Buffer.alloc(length);

    try {
      await handle.read(buffer, 0, length, start);
    } finally {
      await handle.close();
    }

    const content = buffer.toString("utf8");
    const tailLines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .slice(-linesLimit);

    return NextResponse.json({
      enabled: true,
      lines: tailLines,
      lineCount: tailLines.length,
      filePath: syncLogFilePath,
      truncated: start > 0,
      fileSizeBytes: stat.size
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
