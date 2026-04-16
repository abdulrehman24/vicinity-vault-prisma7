import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminSourceService } from "@/src/server/services/admin-source-service";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  try {
    await assertAdminRequest(request, prisma);
    const { id } = params;
    const body = await request.json();
    const service = new AdminSourceService({ prisma });
    const source = await service.updateSource({ id, input: body });
    return NextResponse.json({ source });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await assertAdminRequest(request, prisma);
    const { id } = params;
    const service = new AdminSourceService({ prisma });
    const source = await service.deactivateSource(id);
    return NextResponse.json({ source });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
