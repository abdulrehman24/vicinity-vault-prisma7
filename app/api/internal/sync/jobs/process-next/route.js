import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { SyncJobService } from "@/src/server/services/sync-job-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const workerId = String(body?.workerId || "").trim() || null;
    const service = new SyncJobService({ prisma, workerId });
    const result = await service.processNextJob();
    return NextResponse.json(result);
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
