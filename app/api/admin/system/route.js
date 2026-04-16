import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminDashboardService } from "@/src/server/services/admin-dashboard-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);
    const service = new AdminDashboardService({ prisma });
    const data = await service.getSystemData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
