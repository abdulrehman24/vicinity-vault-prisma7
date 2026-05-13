import { NextResponse } from "next/server";
import { sync_run_trigger } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { env } from "@/src/server/config/env";
import { SyncJobService } from "@/src/server/services/sync-job-service";

export const runtime = "nodejs";

export async function POST(request) {
  const providedSecret = String(request.headers.get("x-sync-scheduler-secret") || "").trim();
  if (!env.syncSchedulerSecret || providedSecret !== env.syncSchedulerSecret) {
    return NextResponse.json({ status: "failed", error: "Unauthorized scheduler request." }, { status: 401 });
  }
  if (!env.syncScheduleEnabled) {
    return NextResponse.json({ status: "skipped", reason: "Scheduled sync is disabled." }, { status: 200 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const service = new SyncJobService({ prisma });
    const result = await service.enqueueVimeoSync({
      dataSourceId: body?.dataSourceId || null,
      initiatedByUserId: null,
      trigger: sync_run_trigger.scheduled,
      runTypeTag: "sync_new_enrich",
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : env.syncSchedulePerPage,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 0
    });

    if (result.status === "accepted") {
      service.processNextJob().catch(() => {});
    }

    return NextResponse.json(result, { status: result.status === "accepted" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ status: "failed", error: error.message }, { status: 500 });
  }
}
