import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminSourceService } from "@/src/server/services/admin-source-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);
    const service = new AdminSourceService({ prisma });
    const sources = await service.listSources();
    return NextResponse.json({ sources });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function POST(request) {
  try {
    const user = await assertAdminRequest(request, prisma);
    const body = await request.json();
    const service = new AdminSourceService({ prisma });
    const source = await service.createSource({
      input: body,
      createdByUserId: user.id
    });
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
