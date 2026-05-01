import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminDashboardService } from "@/src/server/services/admin-dashboard-service";
import { SyncJobService } from "@/src/server/services/sync-job-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);
    const url = new URL(request.url);
    const statusParam = String(url.searchParams.get("status") || "").trim();
    const limitParam = Number(url.searchParams.get("limit"));
    const service = new AdminDashboardService({ prisma });
    const errors = await service.listSyncErrors({
      status: statusParam || null,
      limit: Number.isFinite(limitParam) ? limitParam : 20
    });
    return NextResponse.json({ errors });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function POST(request) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "").trim().toLowerCase();

    if (action !== "retry_all") {
      return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
    }

    const service = new SyncJobService({ prisma });
    const result = await service.enqueueRetryAllErrors({
      initiatedByUserId: user.id,
      perPage: Number.isFinite(body?.perPage) ? Number(body.perPage) : 50,
      maxPages: Number.isFinite(body?.maxPages) ? Number(body.maxPages) : 0,
      testVideoLimit: Number.isFinite(body?.testVideoLimit) ? Number(body.testVideoLimit) : null
    });

    if (result.status === "accepted") {
      service.processNextJob().catch(() => {});
    }

    return NextResponse.json(result, { status: result.status === "accepted" ? 202 : 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
