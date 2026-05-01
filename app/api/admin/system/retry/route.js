import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { SyncJobService } from "@/src/server/services/sync-job-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const syncRunId = String(body?.syncRunId || "").trim();
    const syncErrorId = String(body?.syncErrorId || "").trim();
    if (!syncRunId && !syncErrorId) {
      return NextResponse.json({ error: "syncRunId or syncErrorId is required." }, { status: 400 });
    }

    const service = new SyncJobService({ prisma });
    const commonPayload = {
      initiatedByUserId: user.id,
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 0,
      testVideoLimit: Number.isFinite(body?.testVideoLimit) ? Number(body.testVideoLimit) : null
    };
    const result = syncErrorId
      ? await service.enqueueRetryError({
          syncErrorId,
          ...commonPayload
        })
      : await service.enqueueRetryRun({
          syncRunId,
          ...commonPayload
        });
    if (result.status === "accepted") {
      service.processNextJob().catch(() => {});
    }

    return NextResponse.json(result, { status: result.status === "accepted" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
