import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminVideoService } from "@/src/server/services/admin-video-service";

export const runtime = "nodejs";

export async function GET(request, { params }) {
  try {
    await assertAdminRequest(request, prisma);
    const service = new AdminVideoService({ prisma });
    const video = await service.getVideoById(params.id);
    return NextResponse.json({ video });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 404 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const service = new AdminVideoService({ prisma });
    const result = await service.updateVideo({
      id: params.id,
      input: body,
      adminUserId: user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
