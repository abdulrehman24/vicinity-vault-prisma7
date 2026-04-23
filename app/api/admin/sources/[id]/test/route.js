import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminSourceService } from "@/src/server/services/admin-source-service";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    await assertAdminRequest(request, prisma);
    const { id } = params;
    const service = new AdminSourceService({ prisma });
    const result = await service.testSourceConnection(id);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}

