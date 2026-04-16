import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminDashboardService } from "@/src/server/services/admin-dashboard-service";

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
