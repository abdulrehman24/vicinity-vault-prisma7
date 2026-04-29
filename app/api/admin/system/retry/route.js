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
    if (!syncRunId) {
      return NextResponse.json({ error: "syncRunId is required." }, { status: 400 });
    }

    const service = new SyncJobService({ prisma });
    const result = await service.enqueueRetryRun({
      syncRunId,
      initiatedByUserId: user.id,
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 0,
      testVideoLimit: Number.isFinite(body?.testVideoLimit) ? Number(body.testVideoLimit) : null
    });

    return NextResponse.json(result, { status: result.status === "accepted" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
