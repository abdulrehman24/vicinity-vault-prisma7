import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminOperationsService } from "@/src/server/services/admin-operations-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const syncRunId = String(body?.syncRunId || "").trim();
    if (!syncRunId) {
      return NextResponse.json({ error: "syncRunId is required." }, { status: 400 });
    }

    const service = new AdminOperationsService({ prisma });
    const result = await service.retrySyncRun({
      syncRunId,
      initiatedByUserId: user.id,
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 1
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
