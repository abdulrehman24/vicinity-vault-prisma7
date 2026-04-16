import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminGenreService } from "@/src/server/services/admin-genre-service";

export const runtime = "nodejs";

export async function PATCH(request, { params }) {
  try {
    await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const service = new AdminGenreService({ prisma });
    const genre = await service.updateGenre({
      id: params.id,
      name: body?.name,
      description: body?.description
    });
    return NextResponse.json({ genre });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await assertAdminRequest(request, prisma);
    const service = new AdminGenreService({ prisma });
    await service.deleteGenre(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
