import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminDashboardService } from "@/src/server/services/admin-dashboard-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);
    const { searchParams } = new URL(request.url);
    const service = new AdminDashboardService({ prisma });

    const baselineTag = String(searchParams.get("baselineTag") || "baseline_full_sync").trim();
    const afterTag = String(searchParams.get("afterTag") || "ingest_only").trim();
    const dataSourceId = String(searchParams.get("dataSourceId") || "").trim() || null;
    const sampleSize = Number(searchParams.get("sampleSize") || "3");

    const report = await service.getSyncSpeedReport({
      baselineTag,
      afterTag,
      dataSourceId,
      sampleSize
    });

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
