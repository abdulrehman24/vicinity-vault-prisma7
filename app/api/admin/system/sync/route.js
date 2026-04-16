import { NextResponse } from "next/server";
import { sync_run_trigger } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { VideoSyncService } from "@/src/server/services/video-sync-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const service = new VideoSyncService({ prisma });
    const result = await service.runSync({
      dataSourceId: body?.dataSourceId || null,
      initiatedByUserId: user.id,
      trigger: sync_run_trigger.manual,
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 1
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
