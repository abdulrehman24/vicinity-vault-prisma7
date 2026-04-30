import { NextResponse } from "next/server";
import { sync_run_trigger } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { SyncJobService } from "@/src/server/services/sync-job-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const syncService = new SyncJobService({ prisma });

    const result = await syncService.enqueueVimeoSync({
      dataSourceId: body?.dataSourceId || null,
      initiatedByUserId: null,
      trigger: sync_run_trigger.manual,
      runTypeTag: "baseline_full_sync",
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 0,
      testVideoLimit: Number.isFinite(body?.testVideoLimit) ? Number(body.testVideoLimit) : null
    });

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
