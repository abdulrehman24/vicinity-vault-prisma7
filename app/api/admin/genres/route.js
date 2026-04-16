import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { assertAdminRequest } from "@/src/server/auth/admin";
import { AdminGenreService } from "@/src/server/services/admin-genre-service";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    await assertAdminRequest(request, prisma);
    const service = new AdminGenreService({ prisma });
    const genres = await service.listGenres();
    return NextResponse.json({ genres });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}

export async function POST(request) {
  try {
    await assertAdminRequest(request, prisma);
    const body = await request.json().catch(() => ({}));
    const service = new AdminGenreService({ prisma });
    const genre = await service.createGenre({
      name: body?.name,
      description: body?.description
    });
    return NextResponse.json({ genre }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 400 });
  }
}
