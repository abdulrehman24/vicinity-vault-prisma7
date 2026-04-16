import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { VideoSyncService } from "@/src/server/services/video-sync-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const syncService = new VideoSyncService({ prisma });

    const result = await syncService.runSync({
      dataSourceId: body?.dataSourceId || null,
      initiatedByUserId: user.id,
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 1
    });

    return NextResponse.json(result, { status: 200 });
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
