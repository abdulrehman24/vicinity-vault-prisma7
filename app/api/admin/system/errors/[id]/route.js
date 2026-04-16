import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminDashboardService } from "@/src/server/services/admin-dashboard-service";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  try {
    await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const status = String(body?.status || "").trim();
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: "Error id is required." }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json({ error: "status is required." }, { status: 400 });
    }

    const service = new AdminDashboardService({ prisma });
    const errorRecord = await service.updateSyncErrorStatus({ id, status });
    return NextResponse.json({ errorRecord });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
