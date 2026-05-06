import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminVideoService } from "@/src/server/services/admin-video-service";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const service = new AdminVideoService({ prisma });
    const result = await service.rebuildVideoEmbedding({
      id: params.id,
      adminUserId: user.id
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
