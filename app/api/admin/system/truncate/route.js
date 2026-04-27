import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminOperationsService } from "@/src/server/services/admin-operations-service";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    await assertAdminRequest(request, prisma);
    const service = new AdminOperationsService({ prisma });
    const result = await service.truncateOperationalData();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
