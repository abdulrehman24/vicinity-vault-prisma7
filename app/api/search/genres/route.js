import { NextResponse } from "next/server";
import { prisma } from "@/src/server/db/prisma";
import { resolveCurrentUser } from "@/src/server/auth/user-context";
import { AdminGenreService } from "@/src/server/services/admin-genre-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    await resolveCurrentUser(prisma);
    const service = new AdminGenreService({ prisma });
    const genres = await service.listGenres();
    return NextResponse.json({ genres });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode || 500 });
  }
}
