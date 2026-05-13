import { NextResponse } from "next/server";
import { sync_run_trigger } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { SyncJobService } from "@/src/server/services/sync-job-service";
import { env } from "@/src/server/config/env";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedTrigger =
      body?.trigger === sync_run_trigger.scheduled || body?.trigger === sync_run_trigger.retry
        ? body.trigger
        : sync_run_trigger.manual;
    if (requestedTrigger === sync_run_trigger.scheduled) {
      const providedSecret = String(request.headers.get("x-sync-scheduler-secret") || "").trim();
      if (!env.syncSchedulerSecret || providedSecret !== env.syncSchedulerSecret) {
        return NextResponse.json({ status: "failed", error: "Unauthorized scheduler request." }, { status: 401 });
      }
      if (!env.syncScheduleEnabled) {
        return NextResponse.json({ status: "skipped", reason: "Scheduled sync is disabled." }, { status: 200 });
      }
    }
    const syncService = new SyncJobService({ prisma });
    const runTypeTag = typeof body?.runTypeTag === "string" && body.runTypeTag.trim() ? body.runTypeTag.trim() : "baseline_full_sync";

    const result = await syncService.enqueueVimeoSync({
      dataSourceId: body?.dataSourceId || null,
      initiatedByUserId: null,
      trigger: requestedTrigger,
      runTypeTag,
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 0,
      testVideoLimit: Number.isFinite(body?.testVideoLimit) ? Number(body.testVideoLimit) : null
    });
    if (result.status === "accepted") {
      syncService.processNextJob().catch(() => {});
    }

    return NextResponse.json(result, { status: result.status === "accepted" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        error: error.message
      },
      { status: 500 }
    );
  }
}
