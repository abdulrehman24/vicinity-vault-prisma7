import { NextResponse } from "next/server";
import { sync_run_trigger } from "@prisma/client";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { VideoSyncService } from "@/src/server/services/video-sync-service";
import { dispatchBackgroundSync } from "@/src/server/services/sync-dispatcher";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const { id } = params;
    const dispatch = dispatchBackgroundSync({
      key: `sync:source:${id}`,
      task: async () => {
        const service = new VideoSyncService({ prisma });
        await service.runSync({
          dataSourceId: id,
          initiatedByUserId: user.id,
          trigger: sync_run_trigger.manual,
          perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
          maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 0,
          testVideoLimit: Number.isFinite(body?.testVideoLimit) ? Number(body.testVideoLimit) : null
        });
      }
    });
    if (!dispatch.accepted) {
      return NextResponse.json(
        {
          status: "skipped",
          reason: "A sync job is already running for this source.",
          error: "A sync job is already running for this source."
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        status: "accepted",
        startedAt: dispatch.startedAt
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
