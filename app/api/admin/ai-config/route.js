import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminAiConfigService } from "@/src/server/services/admin-ai-config-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);
    const service = new AdminAiConfigService({ prisma });
    const config = await service.getPublicConfig();
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function PUT(request) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json();
    const service = new AdminAiConfigService({ prisma });
    const config = await service.updateConfig({
      updates: body,
      updatedByUserId: user.id
    });
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
